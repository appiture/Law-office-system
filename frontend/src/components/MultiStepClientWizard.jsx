import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { buildTenantAssetPrefix, getPersistentAssetUrl, uploadAsset } from "../services/storageService";
import { supabaseBuckets } from "../services/supabaseClient";
import {
  assertCasePayload,
  assertChargePayload,
  assertClientPayload,
  assertFollowUpPayload,
  getApiErrorMessage,
  normalizeDigits,
  requiredText,
  resolveOtherSelection,
} from "../utils/validation";
import { sentenceCaseStatus } from "../utils/formatters";
import { getUserRole } from "../services/authService";
import "../pages/formStyles.css";

const ID_TYPES = ["Aadhaar", "PAN", "Passport", "Voter ID", "Driving Licence", "Other"];
const CASE_TYPES = ["Civil", "Criminal", "Family", "Property", "Consumer", "Labour", "Tax", "Corporate", "Constitutional", "Other"];
const CASE_STATUS_OPTIONS = ["DRAFT", "RUNNING", "PENDING", "WAITING", "CLOSED_WON", "CLOSED_LOST", "CLOSED", "ON_HOLD"];
const FOLLOW_UP_TYPES = ["HEARING", "DEADLINE", "JUDGMENT", "NOTE", "BAIL", "CHARGE", "SUBMISSION", "OTHER"];
const FOLLOW_UP_STATUS_OPTIONS = ["PENDING", "COMPLETED", "POSTPONED"];

const STEPS = [
  { key: "client", label: "Client Details" },
  { key: "case", label: "Case Details" },
  { key: "payment", label: "Payment Details" },
  { key: "followup", label: "Follow-up Details" },
];

function blankToNull(value) {
  return String(value ?? "").trim() === "" ? null : value;
}

function FG({ label, required, children, className, hint }) {
  return (
    <div className={`field-group${className ? ` ${className}` : ""}`}>
      <span className="field-label">
        {label}
        {required ? <span className="required-star">*</span> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

function StepDots({ currentStep }) {
  return (
    <div className="step-progress" style={{ marginBottom: 0 }}>
      {STEPS.map((step, index) => (
        <div key={step.key} className="step-progress-item">
          <div className={`step-dot ${index === currentStep ? "spi-active" : index < currentStep ? "spi-done" : ""}`}>
            {index + 1}
          </div>
          <span className="step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function ClientStep({ form, onChange }) {
  const previewPhotoUrl = getPersistentAssetUrl(form.photoUrl);
  const previewIdProofUrl = getPersistentAssetUrl(form.idProofFileUrl);

  const uploadClientAsset = async (file, scope, urlField, pathField) => {
    if (!file) return;
    const upload = await uploadAsset({
      file,
      bucket: supabaseBuckets.clients,
      prefix: buildTenantAssetPrefix({ scope }),
    });
    onChange(urlField, upload.signedUrl || upload.publicUrl);
    onChange(pathField, upload.path);
  };

  return (
    <div className="form-section">
      <div className="form-section-title"><span>Client Details</span></div>
      <div className="form-section-grid">
        <FG label="Full Name" required>
          <input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="e.g. Ramesh Kumar" />
        </FG>
        <FG label="Primary Phone" required>
          <input value={form.phone} onChange={(event) => onChange("phone", normalizeDigits(event.target.value))} inputMode="numeric" maxLength={10} placeholder="10-digit phone number" />
        </FG>
        <FG label="Alternate Phone">
          <input value={form.altPhone} onChange={(event) => onChange("altPhone", normalizeDigits(event.target.value))} inputMode="numeric" maxLength={10} placeholder="Optional 10-digit number" />
        </FG>
        <FG label="Email">
          <input type="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} placeholder="client@example.com" />
        </FG>
        <FG label="Gender">
          <select value={form.gender} onChange={(event) => onChange("gender", event.target.value)}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </FG>
        <FG label="Date of Birth">
          <input type="date" value={form.dateOfBirth} onChange={(event) => onChange("dateOfBirth", event.target.value)} />
        </FG>
        <FG label="Occupation">
          <input value={form.occupation} onChange={(event) => onChange("occupation", event.target.value)} placeholder="Occupation" />
        </FG>
        <FG label="City">
          <input value={form.city} onChange={(event) => onChange("city", event.target.value)} placeholder="City" />
        </FG>
        <FG label="State">
          <input value={form.state} onChange={(event) => onChange("state", event.target.value)} placeholder="State" />
        </FG>
        <FG label="PIN Code">
          <input value={form.pinCode} onChange={(event) => onChange("pinCode", String(event.target.value || "").replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="6-digit PIN" />
        </FG>
        <FG label="Address" className="fcol-full">
          <textarea value={form.address} onChange={(event) => onChange("address", event.target.value)} rows={3} placeholder="House, street, area, city" />
        </FG>
        <FG label="ID Proof Type">
          <select value={form.idProofType} onChange={(event) => onChange("idProofType", event.target.value)}>
            <option value="">Select document</option>
            {ID_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </FG>
        <FG label="ID Proof Number">
          <input value={form.idProofNumber} onChange={(event) => onChange("idProofNumber", event.target.value)} placeholder="Document number" />
        </FG>
        <FG label="Client Photo">
          <input type="file" accept="image/*" onChange={(event) => void uploadClientAsset(event.target.files?.[0], "client-photos", "photoUrl", "photoPath")} />
        </FG>
        <FG label="ID Proof File" hint="PDF, JPG, PNG, Word, or Excel">
          <input type="file" onChange={(event) => void uploadClientAsset(event.target.files?.[0], "client-id-proof", "idProofFileUrl", "idProofFilePath")} />
        </FG>
        {previewPhotoUrl ? (
          <div className="fcol-full" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <img src={previewPhotoUrl} alt={form.name || "Client"} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover" }} />
            <button type="button" className="btn-danger-soft" onClick={() => { onChange("photoUrl", ""); onChange("photoPath", ""); }}>Remove Photo</button>
          </div>
        ) : null}
        {previewIdProofUrl ? (
          <FG label="Uploaded Proof" className="fcol-full">
            <a href={previewIdProofUrl} target="_blank" rel="noreferrer">View uploaded proof</a>
          </FG>
        ) : null}
        <FG label="Notes" className="fcol-full">
          <textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows={4} placeholder="Internal notes" />
        </FG>
      </div>
    </div>
  );
}

function CaseStep({ form, onChange, lawyers = [] }) {
  return (
    <div className="form-section">
      <div className="form-section-title"><span>Case Details</span></div>
      <div className="form-section-grid">
        <FG label="Case Number" required>
          <input value={form.caseNumber} onChange={(event) => onChange("caseNumber", event.target.value)} placeholder="e.g. CIV/2024/001" />
        </FG>
        <FG label="Case Type" required>
          <select value={form.caseType} onChange={(event) => onChange("caseType", event.target.value)}>
            <option value="">Select type</option>
            {CASE_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </FG>
        {form.caseType === "Other" ? (
          <FG label="Custom Case Type" required className="fcol-full">
            <input value={form.caseTypeOther} onChange={(event) => onChange("caseTypeOther", event.target.value)} placeholder="Enter case type" />
          </FG>
        ) : null}
        <FG label="Court">
          <input value={form.courtName} onChange={(event) => onChange("courtName", event.target.value)} placeholder="Court name" />
        </FG>
        <FG label="Assigned Lawyer" hint={userRole === "LAWYER" ? "Only admins can reassign cases." : ""}>
          <input
            value={form.assignedLawyer}
            onChange={(event) => onChange("assignedLawyer", event.target.value)}
            list="wizard-assigned-lawyers"
            placeholder="Select or type assigned lawyer"
            disabled={userRole === "LAWYER"}
          />
          <datalist id="wizard-assigned-lawyers">
            {lawyers.map((lawyer) => (
              <option key={lawyer.id} value={lawyer.value}>{lawyer.label}</option>
            ))}
          </datalist>
        </FG>
        <FG label="Judge">
          <input value={form.judgeName} onChange={(event) => onChange("judgeName", event.target.value)} placeholder="Judge name" />
        </FG>
        <FG label="Status">
          <select value={form.status} onChange={(event) => onChange("status", event.target.value)}>
            {CASE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{sentence(status)}</option>)}
          </select>
        </FG>
        <FG label="Filing Date">
          <input type="date" value={form.filingDate} onChange={(event) => onChange("filingDate", event.target.value)} />
        </FG>
        <FG label="First Hearing Date">
          <input type="date" value={form.firstHearingDate} onChange={(event) => onChange("firstHearingDate", event.target.value)} />
        </FG>
        <FG label="Next Hearing Date">
          <input type="date" value={form.nextHearingDate} onChange={(event) => onChange("nextHearingDate", event.target.value)} />
        </FG>
        <FG label="Opponent Name">
          <input value={form.opponentName} onChange={(event) => onChange("opponentName", event.target.value)} placeholder="Opponent name" />
        </FG>
        <FG label="Opponent Lawyer">
          <input value={form.opponentLawyer} onChange={(event) => onChange("opponentLawyer", event.target.value)} placeholder="Opponent lawyer" />
        </FG>
        <FG label="Case Description" className="fcol-full">
          <textarea value={form.caseDescription} onChange={(event) => onChange("caseDescription", event.target.value)} rows={4} placeholder="Case summary" />
        </FG>
      </div>
    </div>
  );
}

function PaymentStep({ payments, setPayments }) {
  const update = (index, field, value) => {
    setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  return (
    <div className="form-section">
      <div className="form-section-title"><span>Payment Details</span></div>
      {payments.length ? payments.map((item, index) => (
        <div key={item.key} className="enhanced-card" style={{ marginBottom: 12 }}>
          <div className="enhanced-card-header">
            <div className="enhanced-card-title-wrap">
              <h4 className="enhanced-card-title">Charge Item #{index + 1}</h4>
              <button type="button" className="btn-danger-soft" onClick={() => setPayments(payments.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          </div>
          <div className="form-section-grid">
            <FG label="Category Label" required>
              <input value={item.label} onChange={(event) => update(index, "label", event.target.value)} placeholder="e.g. Lawyer Fees" />
            </FG>
            <FG label="Total Amount" required>
              <input type="number" min="0" step="0.01" value={item.totalAmount} onChange={(event) => update(index, "totalAmount", event.target.value)} placeholder="0.00" />
            </FG>
            <FG label="Already Paid">
              <input type="number" min="0" step="0.01" value={item.paidAmount} onChange={(event) => update(index, "paidAmount", event.target.value)} placeholder="0.00" />
            </FG>
            <FG label="Due Date">
              <input type="date" value={item.dueDate} onChange={(event) => update(index, "dueDate", event.target.value)} />
            </FG>
            <FG label="Lawyer Fee" className="fcol-full">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={Boolean(item.isLawyerFee)} onChange={(event) => update(index, "isLawyerFee", event.target.checked)} />
                <span>Mark this charge as lawyer fee</span>
              </label>
            </FG>
            <FG label="Description" className="fcol-full">
              <textarea value={item.description} onChange={(event) => update(index, "description", event.target.value)} rows={2} placeholder="What does this fee cover?" />
            </FG>
          </div>
        </div>
      )) : <div className="empty-box" style={{ marginBottom: 12 }}>No charge items added yet.</div>}

      <button type="button" className="btn-neutral" style={{ width: "100%" }} onClick={() => setPayments([...payments, { key: Date.now(), label: "", totalAmount: "", paidAmount: "", dueDate: "", isLawyerFee: false, description: "" }])}>
        Add Charge Item
      </button>
    </div>
  );
}

function FollowUpStep({ followUps, setFollowUps }) {
  const update = (index, field, value) => {
    setFollowUps(followUps.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  return (
    <div className="form-section">
      <div className="form-section-title"><span>Follow-up Details</span></div>
      {followUps.length ? followUps.map((item, index) => (
        <div key={item.key} className="enhanced-card" style={{ marginBottom: 12 }}>
          <div className="enhanced-card-header">
            <div className="enhanced-card-title-wrap">
              <h4 className="enhanced-card-title">Follow-up #{index + 1}</h4>
              <button type="button" className="btn-danger-soft" onClick={() => setFollowUps(followUps.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          </div>
          <div className="form-section-grid">
            <FG label="Type" required>
              <select value={item.type} onChange={(event) => update(index, "type", event.target.value)}>
                {FOLLOW_UP_TYPES.map((type) => <option key={type} value={type}>{sentence(type)}</option>)}
              </select>
            </FG>
            <FG label="Status">
              <select value={item.status} onChange={(event) => update(index, "status", event.target.value)}>
                {FOLLOW_UP_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{sentence(status)}</option>)}
              </select>
            </FG>
            <FG label="Scheduled Date & Time" required>
              <input type="datetime-local" value={item.scheduledAt} onChange={(event) => update(index, "scheduledAt", event.target.value)} />
            </FG>
            {item.status === "POSTPONED" ? (
              <FG label="Postponed To">
                <input type="datetime-local" value={item.postponedTo || ""} onChange={(event) => update(index, "postponedTo", event.target.value)} />
              </FG>
            ) : null}
            <FG label="Title" required className="fcol-full">
              <input value={item.title} onChange={(event) => update(index, "title", event.target.value)} placeholder="e.g. First Hearing" />
            </FG>
            <FG label="Notes" className="fcol-full">
              <textarea value={item.notes} onChange={(event) => update(index, "notes", event.target.value)} rows={3} placeholder="Notes" />
            </FG>
          </div>
        </div>
      )) : <div className="empty-box" style={{ marginBottom: 12 }}>No follow-ups added yet.</div>}

      <button type="button" className="btn-neutral" style={{ width: "100%" }} onClick={() => setFollowUps([...followUps, { key: Date.now(), type: "HEARING", title: "", scheduledAt: "", status: "PENDING", notes: "", postponedTo: "" }])}>
        Add Follow-up
      </button>
    </div>
  );
}

const sentence = sentenceCaseStatus;

export default function MultiStepClientWizard({ client, onClose, onSave, initialStep = 0 }) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toast, setToast] = useState("");
  const [lawyers, setLawyers] = useState([]);
  const [userRole, setUserRole] = useState("");
  const isEdit = Boolean(client);

  const [formData, setFormData] = useState({
    client: {
      id: client?.id || null,
      name: client?.name || "",
      phone: client?.phone || "",
      altPhone: client?.altPhone || "",
      email: client?.email || "",
      address: client?.address || "",
      gender: client?.gender || "",
      dateOfBirth: client?.dateOfBirth || "",
      occupation: client?.occupation || "",
      city: client?.city || "",
      state: client?.state || "",
      pinCode: client?.pinCode || "",
      photoUrl: client?.photoUrl || "",
      photoPath: client?.photoPath || "",
      idProofType: client?.idProofType || "",
      idProofNumber: client?.idProofNumber || "",
      idProofFileUrl: client?.idProofFileUrl || "",
      idProofFilePath: client?.idProofFilePath || "",
      notes: client?.notes || "",
    },
    caseData: {
      id: client?.cases?.[0]?.id || null,
      clientId: client?.id || null,
      caseNumber: client?.cases?.[0]?.caseNumber || "",
      caseType: client?.cases?.[0]?.caseType || "",
      caseTypeOther: "",
      courtName: client?.cases?.[0]?.courtName || "",
      assignedLawyer: client?.cases?.[0]?.assignedLawyer || "",
      assigned_lawyer_id: client?.cases?.[0]?.assignedLawyerId || "",
      judgeName: client?.cases?.[0]?.judgeName || "",
      filingDate: client?.cases?.[0]?.filingDate || "",
      firstHearingDate: client?.cases?.[0]?.firstHearingDate || "",
      nextHearingDate: client?.cases?.[0]?.nextHearingDate || "",
      opponentName: client?.cases?.[0]?.opponentName || "",
      opponentLawyer: client?.cases?.[0]?.opponentLawyer || "",
      caseDescription: client?.cases?.[0]?.caseDescription || "",
      status: client?.cases?.[0]?.status || "DRAFT",
    },
    charges: [],
    followUps: [],
  });

  const title = useMemo(() => client ? `Edit ${client.name}` : "New Client", [client]);

  useEffect(() => {
    let cancelled = false;
    platformApi.getAssignableLawyers()
      .then((rows) => {
        if (!cancelled) setLawyers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setLawyers([]);
      });

    setUserRole(getUserRole());

    return () => { cancelled = true; };
  }, []);

  const setClientField = (field, value) => {
    setFormData((current) => ({ ...current, client: { ...current.client, [field]: value } }));
    setSubmitError("");
  };

  const setCaseField = (field, value) => {
    setFormData((current) => ({ ...current, caseData: { ...current.caseData, [field]: value } }));
    setSubmitError("");
  };

  const validateClientDetails = () => {
    try {
      assertClientPayload({
        ...formData.client,
        phone: normalizeDigits(formData.client.phone),
        altPhone: formData.client.altPhone ? normalizeDigits(formData.client.altPhone) : "",
        email: formData.client.email?.trim(),
      });
      setSubmitError("");
      return true;
    } catch (error) {
      setSubmitError(error.message || "Please check the form and try again.");
      return false;
    }
  };

  const validateCurrentStep = () => {
    try {
      if (currentStep === 0) {
        return validateClientDetails();
      }

      if (currentStep === 1) {
        const hasPersistedClient = Boolean(formData.client.id);
        const hasValidNewClient =
          requiredText(formData.client.name) &&
          normalizeDigits(formData.client.phone).length === 10;

        assertCasePayload({
          ...formData.caseData,
          clientId: hasPersistedClient || hasValidNewClient ? (formData.client.id || "NEW_CLIENT") : "",
          caseType: resolveOtherSelection(formData.caseData.caseType, formData.caseData.caseTypeOther),
        });
      }

      if (currentStep === 2) {
        formData.charges.forEach((charge) => {
          assertChargePayload({
            ...charge,
            totalAmount: Number(charge.totalAmount),
            paidAmount: Number(charge.paidAmount || 0),
          });
        });
      }

      if (currentStep === 3) {
        formData.followUps.forEach((followUp) => {
          assertFollowUpPayload(followUp);
        });
      }

      setSubmitError("");
      return true;
    } catch (error) {
      setSubmitError(error.message || "Please check the form and try again.");
      return false;
    }
  };

  const submit = async (saveAsDraft, { profileOnly = false } = {}) => {
    if (profileOnly) {
      setCurrentStep(0);
    }

    if (profileOnly && !validateClientDetails()) {
      return;
    }

    if (!profileOnly && !saveAsDraft && !validateCurrentStep()) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client: {
          ...formData.client,
          phone: normalizeDigits(formData.client.phone),
          altPhone: formData.client.altPhone && normalizeDigits(formData.client.altPhone).length === 10 ? normalizeDigits(formData.client.altPhone) : null,
          email: formData.client.email?.trim() || null,
          dateOfBirth: blankToNull(formData.client.dateOfBirth),
          pinCode: formData.client.pinCode && String(formData.client.pinCode).replace(/\D/g, "").length === 6 ? String(formData.client.pinCode).replace(/\D/g, "") : null,
        },
        caseData: profileOnly ? null : {
          ...formData.caseData,
          clientId: formData.client.id || null,
          caseType: resolveOtherSelection(formData.caseData.caseType, formData.caseData.caseTypeOther),
          filingDate: blankToNull(formData.caseData.filingDate),
          firstHearingDate: blankToNull(formData.caseData.firstHearingDate),
          nextHearingDate: blankToNull(formData.caseData.nextHearingDate),
        },
        charges: profileOnly ? [] : formData.charges.map((charge, index) => ({
          label: charge.label,
          totalAmount: Number(charge.totalAmount),
          paidAmount: Number(charge.paidAmount || 0),
          dueDate: blankToNull(charge.dueDate),
          displayOrder: index,
          isLawyerFee: Boolean(charge.isLawyerFee),
          description: charge.description || "",
        })),
        followUps: profileOnly ? [] : formData.followUps.map((followUp) => ({
          type: followUp.type,
          title: followUp.title,
          scheduledAt: blankToNull(followUp.scheduledAt),
          status: followUp.status,
          notes: followUp.notes || "",
          postponedTo: followUp.status === "POSTPONED" ? blankToNull(followUp.postponedTo) : null,
        })),
        saveAsDraft,
        currentStep,
      };

      await onSave(payload);
      if (profileOnly || !saveAsDraft) {
        setToast(profileOnly ? "Client profile saved successfully." : "Client and case saved successfully.");
        setTimeout(() => {
          setToast("");
          onClose();
        }, profileOnly ? 1200 : 1800);
      }
    } catch (error) {
      setSubmitError(`Error: ${getApiErrorMessage(error, "Failed to save.")}`);
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="flow-modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flow-modal" style={{ maxWidth: 860 }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{title}</h3>
            <p>Step {currentStep + 1} of {STEPS.length}</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>X</button>
        </div>

        <StepDots currentStep={currentStep} />

        {submitError ? (
          <div style={{ padding: "0 24px 4px" }}>
            <div className="form-error-banner">{submitError}</div>
          </div>
        ) : null}

        <div className="flow-modal-body">
          {currentStep === 0 ? <ClientStep form={formData.client} onChange={setClientField} /> : null}
          {currentStep === 1 ? <CaseStep form={formData.caseData} onChange={setCaseField} lawyers={lawyers} userRole={userRole} /> : null}
          {currentStep === 2 ? <PaymentStep payments={formData.charges} setPayments={(charges) => setFormData((current) => ({ ...current, charges }))} /> : null}
          {currentStep === 3 ? <FollowUpStep followUps={formData.followUps} setFollowUps={(followUps) => setFormData((current) => ({ ...current, followUps }))} /> : null}
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={onClose}>Cancel</button>
          <div className="flow-modal-footer-right">
            {currentStep > 0 ? <button type="button" className="btn-neutral" onClick={() => setCurrentStep(currentStep - 1)}>Back</button> : null}
            {isEdit && currentStep === 0 ? (
              <>
                <button type="button" className="btn-neutral" onClick={() => void submit(true, { profileOnly: true })} disabled={saving}>
                  {saving ? "Saving..." : "Save Profile"}
                </button>
                <button type="button" className="btn-gold" onClick={() => { if (validateCurrentStep()) setCurrentStep(currentStep + 1); }}>Edit Case Details</button>
              </>
            ) : currentStep < STEPS.length - 1 ? (
              <button type="button" className="btn-gold" onClick={() => { if (validateCurrentStep()) setCurrentStep(currentStep + 1); }}>Next</button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="btn-neutral" onClick={() => void submit(true)} disabled={saving}>Save Draft</button>
                <button type="button" className="btn-gold" onClick={() => void submit(false)} disabled={saving}>{saving ? "Saving..." : "Complete & Save"}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast ? <div className="success-toast">{toast}</div> : null}
    </div>
  );

  return createPortal(modal, document.body);
}




