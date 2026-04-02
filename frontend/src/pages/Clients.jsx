import { useEffect, useMemo, useRef, useState } from "react";
import axios from "../api/axios";
import "./Clients.css";
import "./formStyles.css";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserEmail, getUserRole } from "../utils/auth";

const normalizeRole = (value) =>
  String(value || "")
    .replace(/^ROLE_/i, "")
    .trim()
    .toUpperCase();

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const escapeCell = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatNumberWithCommas = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const downloadExcel = (sheetName, headers, rows, fileName) => {
  const headerHtml = headers
    .map(
      (header) =>
        `<th style="background-color: #003366; color: white; font-weight: bold; border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px;">${escapeCell(header)}</th>`
    )
    .join("");

  // Determine which columns are currency based on header names
  const currencyColumns = new Set(
    headers
      .map((h, idx) => (/amount/i.test(h) || /balance/i.test(h) ? idx : -1))
      .filter((i) => i >= 0)
  );

  const rowsHtml = rows
    .map((row) => {
      return `<tr>${row
        .map((cell, cellIndex) => {
          const isCurrency = currencyColumns.has(cellIndex);
          const cellValue = isCurrency && !isNaN(cell) ? formatNumberWithCommas(cell) : escapeCell(cell);
          const textAlign = isCurrency ? "right" : "left";
          return `<td style="background-color: #FFFFFF; border: 1px solid #ccc; padding: 6px; text-align: ${textAlign};">${cellValue}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

    const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table {
            border-collapse: collapse;
            width: 100%;
            font-family: Arial, sans-serif;
            font-size: 11px;
          }
          caption {
            font-size: 14px;
            font-weight: bold;
            color: #003366;
            padding: 10px;
            text-align: center;
            background-color: #E6F2FF;
          }
        </style>
      </head>
      <body>
        <table border="1">
          <caption>${escapeCell(sheetName)}</caption>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

function Clients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [dueDateFilter, setDueDateFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [remarksText, setRemarksText] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentId, setPaymentId] = useState("");
  const [caseDetailFiles, setCaseDetailFiles] = useState([]);
  const [nextDueDate, setNextDueDate] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [highlightedClientId, setHighlightedClientId] = useState(null);
  const [viewingDocsClient, setViewingDocsClient] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const clientCardRefs = useRef({});
  const focusedClientRef = useRef(null);

  const role = normalizeRole(getUserRole());
  const canUpdateFollowUp = role === "FOUNDER" || role === "ADMIN";
  const navigate = useNavigate();
  const location = useLocation();
  const email = getUserEmail() || "";
  const targetClientId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const clientId = params.get("clientId");
    if (!clientId) return null;
    const parsedId = Number(clientId);
    return Number.isFinite(parsedId) ? parsedId : null;
  }, [location.search]);
  const isUiLocked = isClientsLoading || isSaving || isCompressingImage;

  useEffect(() => {
    fetchClients(true);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchClients();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (showCameraModal && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [showCameraModal]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selectedImagePreview) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  useEffect(() => {
    focusedClientRef.current = null;
  }, [targetClientId]);

  useEffect(() => {
    if (!targetClientId || clients.length === 0) return;
    if (focusedClientRef.current === targetClientId) return;

    const targetElement = clientCardRefs.current[targetClientId];
    if (!targetElement) return;

    focusedClientRef.current = targetClientId;
    setHighlightedClientId(targetClientId);
    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedClientId(null);
    }, 2500);
  }, [clients, targetClientId]);

  const buildCloudinaryUrl = (url, transformation) => {
    if (!url) return "";
    const marker = "/upload/";
    const markerIndex = url.indexOf(marker);
    if (markerIndex === -1) return url;

    return (
      url.slice(0, markerIndex + marker.length) +
      transformation +
      "/" +
      url.slice(markerIndex + marker.length)
    );
  };

  const getCardImageUrl = (url) =>
    buildCloudinaryUrl(url, "f_auto,q_auto:eco,c_fill,w_420,h_260,g_auto");

  const getExpandedImageUrl = (url) =>
    buildCloudinaryUrl(url, "f_auto,q_auto:best,c_limit,w_2200");

  const extractErrorMessage = (error, fallback = "Save failed") => {
    const data = error?.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    return fallback;
  };

  const compressImageFile = (file) =>
    new Promise((resolve, reject) => {
      if (!file || !file.type?.startsWith("image/")) {
        resolve(file);
        return;
      }

      const image = new Image();
      const sourceUrl = URL.createObjectURL(file);

      image.onload = () => {
        try {
          const maxWidth = 960;
          const scale = Math.min(1, maxWidth / image.width);
          const targetWidth = Math.max(1, Math.round(image.width * scale));
          const targetHeight = Math.max(1, Math.round(image.height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, targetWidth, targetHeight);

          const maxBytes = 350 * 1024;
          const toBlobWithQuality = (quality) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  URL.revokeObjectURL(sourceUrl);
                  reject(new Error("Image compression failed"));
                  return;
                }

                if (blob.size <= maxBytes || quality <= 0.42) {
                  const output = new File(
                    [blob],
                    `${file.name.replace(/\.[^/.]+$/, "") || "client-image"}.jpg`,
                    { type: "image/jpeg" }
                  );
                  URL.revokeObjectURL(sourceUrl);
                  resolve(output);
                  return;
                }

                toBlobWithQuality(quality - 0.08);
              },
              "image/jpeg",
              quality
            );
          };

          toBlobWithQuality(0.72);
        } catch (error) {
          URL.revokeObjectURL(sourceUrl);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error("Unable to load image for compression"));
      };

      image.src = sourceUrl;
    });

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const updateSelectedImage = (file) => {
    if (selectedImagePreview) {
      URL.revokeObjectURL(selectedImagePreview);
      setSelectedImagePreview("");
    }

    setSelectedImageFile(file);
    if (file) {
      setSelectedImagePreview(URL.createObjectURL(file));
    }
  };

  const prepareSelectedImage = async (file) => {
    if (!file) {
      updateSelectedImage(null);
      return;
    }

    try {
      setIsCompressingImage(true);
      const compressedFile = await compressImageFile(file);
      updateSelectedImage(compressedFile);
    } catch {
      alert("Image processing failed. Please try another file.");
      updateSelectedImage(null);
    } finally {
      setIsCompressingImage(false);
    }
  };

  const openCamera = async () => {
    if (isUiLocked) return;
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Camera is not supported in this browser.";
      setCameraError(message);
      alert(message);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setShowCameraModal(true);
    } catch {
      const message = "Camera permission denied or camera unavailable.";
      setCameraError(message);
      alert(message);
    }
  };

  const closeCamera = () => {
    stopCamera();
    setShowCameraModal(false);
  };

  const captureFromCamera = () => {
    if (isUiLocked) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setCameraError("Unable to capture image.");
      return;
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Capture failed. Try again.");
          return;
        }

        const file = new File([blob], `client-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        prepareSelectedImage(file);
        closeCamera();
      },
      "image/jpeg",
      0.9
    );
  };

  const fetchClients = async (withLoader = false) => {
    if (withLoader) {
      setIsClientsLoading(true);
    }

    try {
      const response = await axios.get("/clients");

      const data = Array.isArray(response.data)
        ? response.data
        : response.data.content || [];

      const today = new Date().getTime();

      const sorted = [...data].sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;

        const aOverdue = a.status !== "PAID" && aDue < today;
        const bOverdue = b.status !== "PAID" && bDue < today;

        if (aOverdue !== bOverdue) {
          return bOverdue - aOverdue;
        }
        const aLatestPayment = a.payments?.length
          ? new Date(a.payments[a.payments.length - 1].updatedAt).getTime()
          : new Date(a.createdAt).getTime();

        const bLatestPayment = b.payments?.length
          ? new Date(b.payments[b.payments.length - 1].updatedAt).getTime()
          : new Date(b.createdAt).getTime();

        if (aLatestPayment !== bLatestPayment) {
          return bLatestPayment - aLatestPayment;
        }
        const aBalance = Number(a.balanceAmount) || 0;
        const bBalance = Number(b.balanceAmount) || 0;

        if (aBalance !== bBalance) {
          return bBalance - aBalance;
        }

        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();

        return bCreated - aCreated;
      });

      setClients(sorted);
    } catch (error) {
      console.log(error);
      setClients([]);
    } finally {
      if (withLoader) {
        setIsClientsLoading(false);
      }
    }
  };


  const normalizePhone = (value) => String(value || "").replace(/\D/g, "").slice(0, 10);

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (isUiLocked) return;

    const normalizedPhone = normalizePhone(editClient?.phone);
    if (normalizedPhone.length !== 10) {
      alert("Phone number must be exactly 10 digits.");
      return;
    }

    setIsSaving(true);
    try {
      if (editClient?.id) {
        if (selectedImageFile || caseDetailFiles.length > 0) {
          const formData = new FormData();
          formData.append("name", editClient?.name ?? "");
          formData.append("caseType", editClient?.caseType ?? "");
          formData.append("phone", normalizedPhone);
          formData.append("totalAmount", String(editClient?.totalAmount ?? 0));
          formData.append("paidAmount", String(editClient?.paidAmount ?? 0));
          formData.append("dueDate", editClient?.dueDate ?? "");
          formData.append("remarks", editClient?.remarks ?? "");
          
          if (selectedImageFile) {
            formData.append("image", selectedImageFile);
          }
          
          caseDetailFiles.forEach(file => {
            formData.append("caseDetails", file);
          });

          await axios.put(`/clients/${editClient.id}`, formData);
        } else {
          const updatePayload = {
            name: editClient?.name ?? "",
            caseType: editClient?.caseType ?? "",
            phone: normalizedPhone,
            totalAmount: Number(editClient?.totalAmount ?? 0),
            paidAmount: Number(editClient?.paidAmount ?? 0),
            dueDate: editClient?.dueDate ?? null,
            remarks: editClient?.remarks ?? "",
          };

          await axios.put(`/clients/${editClient.id}`, updatePayload);
        }
      } else {
        const formData = new FormData();
        formData.append("name", editClient?.name ?? "");
        formData.append("caseType", editClient?.caseType ?? "");
        formData.append("phone", normalizedPhone);
        formData.append("totalAmount", String(editClient?.totalAmount ?? 0));
        formData.append("paidAmount", String(editClient?.paidAmount ?? 0));
        formData.append("dueDate", editClient?.dueDate ?? "");
        formData.append("remarks", editClient?.remarks ?? "");
        
        if (selectedImageFile) {
          formData.append("image", selectedImageFile);
        }
        
        caseDetailFiles.forEach(file => {
          formData.append("caseDetails", file);
        });

        await axios.post("/clients", formData);
      }
      setShowForm(false);
      setEditClient(null);
      updateSelectedImage(null);
      setCaseDetailFiles([]);
      await fetchClients(true);
    } catch (error) {
      alert(extractErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClient = async (id) => {
    if (isUiLocked) return;
    if (!window.confirm("Delete this client?")) return;
    setIsSaving(true);
    try {
      await axios.delete(`/clients/${id}`);
      await fetchClients(true);
    } catch (error) {
      alert(extractErrorMessage(error, "Delete failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const updateFollowUpContacted = async (id, contacted) => {
    if (isUiLocked) return;
    setIsSaving(true);
    try {
      await axios.put(`/clients/${id}/follow-up`, { contacted });
      setClients((prev) =>
        prev.map((client) =>
          client.id === id
            ? {
                ...client,
                followUpContacted: contacted,
                followUpUpdatedBy: email || client.followUpUpdatedBy,
                followUpUpdatedAt: new Date().toISOString(),
              }
            : client
        )
      );
    } catch (error) {
      alert(extractErrorMessage(error, "Follow-up update failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCaseDetailAttachment = async (detailId, clientId) => {
    if (isUiLocked) return;
    if (!window.confirm("Remove this document?")) return;
    setIsSaving(true);
    try {
      await axios.delete(`/clients/case-details/${detailId}`);
      // Update local state to remove the file from the client object
      setClients(prev => prev.map(c => {
        if (c.id === clientId) {
          const updated = {
            ...c,
            caseDetails: c.caseDetails.filter(d => d.id !== detailId)
          };
          // Sync with modal view if open
          if (viewingDocsClient && viewingDocsClient.id === clientId) {
            setViewingDocsClient(updated);
          }
          return updated;
        }
        return c;
      }));
    } catch (error) {
      alert(extractErrorMessage(error, "Failed to remove document"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickUpload = async (clientId, file) => {
    if (!file || isUiLocked) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`/clients/${clientId}/case-details`, formData);
      
      // Update local state with the updated client from response
      setClients(prev => prev.map(c => c.id === clientId ? response.data : c));
      
      // If we are currently viewing this client's docs in a modal, update that too
      if (viewingDocsClient && viewingDocsClient.id === clientId) {
        setViewingDocsClient(response.data);
      }
    } catch (error) {
      alert(extractErrorMessage(error, "Failed to upload document"));
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const handlePaymentUpdate = async () => {
    if (isUiLocked || !selectedClient) return;

    const hasPaymentValue = paymentAmount !== "";
    const parsedPaymentAmount = hasPaymentValue ? Number(paymentAmount) : 0;
    const currentBalance = Number(selectedClient.balanceAmount || 0);

    if (!hasPaymentValue && !nextDueDate) {
      alert("Enter payment amount or next due date.");
      return;
    }

    if (hasPaymentValue && parsedPaymentAmount > currentBalance) {
      alert("Payment amount cannot exceed balance amount.");
      return;
    }

    setIsSaving(true);
    try {
      if (hasPaymentValue && parsedPaymentAmount > 0) {
        await axios.post(
          `/payments/${selectedClient.id}?amount=${parsedPaymentAmount}&paymentMode=${paymentMode}${paymentId ? `&paymentId=${paymentId}` : ""}`
        );
      }

      const projectedBalance = Math.max(0, currentBalance - parsedPaymentAmount);
      const clientSettled = hasPaymentValue && projectedBalance === 0;

      if (!clientSettled && nextDueDate) {
        await axios.put(`/clients/${selectedClient.id}/next-due`, {
          nextDueDate: nextDueDate || null,
          nextDueRemarks: null,
        });
      }

      setShowPaymentModal(false);
      setSelectedClient(null);
      setPaymentAmount("");
      setNextDueDate("");
      await fetchClients(true);
    } catch (error) {
      alert(extractErrorMessage(error, "Update failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRemarks = async () => {
    if (isUiLocked || !selectedClient) return;

    if (!remarksText.trim()) {
      alert("Please enter a remark.");
      return;
    }

    setIsSaving(true);
    try {
      await axios.put(`/clients/${selectedClient.id}/remarks`, {
        remarks: remarksText.trim(),
      });

      setShowRemarksModal(false);
      setRemarksText("");
      setSelectedClient(null);
      await fetchClients(true);
    } catch (error) {
      alert(extractErrorMessage(error, "Remarks update failed"));
    } finally {
      setIsSaving(false);
    }
  };


  const filteredClients = clients.filter((client) => {
    const searchTerm = search.toLowerCase();

    const matchesSearch =
      client.name?.toLowerCase().includes(searchTerm) ||
      client.caseType?.toLowerCase().includes(searchTerm) ||
      client.phone?.toLowerCase().includes(searchTerm);

    if (!matchesSearch) return false;

    if (dueDateFilter && client?.dueDate !== dueDateFilter) {
      return false;
    }

    const isOverdue =
      client.status !== "PAID" && client.dueDate && new Date(client.dueDate) < new Date() ;
    
    if (filter === "ALL") return true;
    if (filter === "OVERDUE") return isOverdue;
    if (filter === "PARTIAL") return client.status === "PARTIAL" && !isOverdue;
    if (filter === "PAID") return client.status === "PAID";

    return true;

  });

  const getPaymentHistorySummary = (client) => {
    const payments = Array.isArray(client?.payments) ? [...client.payments] : [];
    if (payments.length === 0) return "-";

    return payments
      .sort((a, b) => {
        const aTime = new Date(a?.updatedAt || a?.paymentDate || 0).getTime();
        const bTime = new Date(b?.updatedAt || b?.paymentDate || 0).getTime();
        return bTime - aTime;
      })
      .map((payment) => {
        const amount = Number(payment?.amount || 0);
        const paymentDate = payment?.paymentDate || "-";
        const updatedAt = formatDateTime(payment?.updatedAt || payment?.paymentDate);
        const mode = payment?.paymentMode || "Cash";
        const idStr = payment?.paymentId ? ` (ID: ${payment.paymentId})` : "";
        return `INR ${currencyFormatter.format(amount)} via ${mode}${idStr} on ${paymentDate} by ${updatedBy} at ${updatedAt}`;
      })
      .join(" | ");
  };
  
  const downloadFilteredClientsReport = () => {
    if (isUiLocked) return;
    if (filteredClients.length === 0) {
      alert("No clients available for the current filters.");
      return;
    }
    
    const rows = filteredClients.map((client) => [
      client?.name || "-",
      client?.caseType || "-",
      client?.phone || "-",
      client?.dueDate || "-",
      client?.status || "-",
      Number(client?.totalAmount || 0),
      Number(client?.paidAmount || 0),
      Number(client?.balanceAmount || 0),
      client?.createdByName || "-",
      formatDateTime(client?.createdAt),
      getPaymentHistorySummary(client),
      client?.remarks || "-",
      client?.followUpContacted ? "Yes" : "No",
      client?.followUpUpdatedBy || "-",
      formatDateTime(client?.followUpUpdatedAt),
    ]);

    const dateTag = new Date().toISOString().slice(0, 10);
    const searchTag = search.trim() ? search.trim().replace(/\s+/g, "-").slice(0, 24) : "all";
    const dueDateTag = dueDateFilter || "all-dates";

    downloadExcel(
      "Clients Report",
      [
        "Name",
        "Case Type",
        "Phone",
        "Due Date",
        "Status",
        "Total Amount",
        "Paid Amount",
        "Balance Amount",
        "Added By",
        "Added At",
        "Payment History Updates",
        "Remarks",
        "Follow-up Contacted",
        "Follow-up Updated By",
        "Follow-up Updated At",
      ],
      rows,
      `clients-${filter.toLowerCase()}-${searchTag}-${dueDateTag}-${dateTag}`
    );
  };
   

  return (
    <div className="clients-container">
      <div className="clients-topbar">
        <button
        className="back-btn"
        onClick={() => navigate("/dashboard")}
        disabled={isUiLocked}
        >
           Back
        </button>
        <div className="clients-topbar-field clients-topbar-search">
          <label htmlFor="clients-search-input">Search Clients</label>
          <input
            id="clients-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={isUiLocked}
          />
        </div>

        <div className="clients-topbar-field clients-topbar-filter">
          <label htmlFor="clients-filter-select">Filter Status</label>
          <select
            id="clients-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={isUiLocked}
          >
            <option value="ALL">All</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>

        <div className="clients-topbar-field clients-topbar-date">
          <label htmlFor="clients-due-date-filter">Due Date</label>
          <input
            id="clients-due-date-filter"
            type="date"
            value={dueDateFilter}
            onChange={(e) => setDueDateFilter(e.target.value)}
            disabled={isUiLocked}
          />
        </div>

        {(role === "FOUNDER" || role === "ADMIN") && (
          <button
            type="button"
            disabled={isUiLocked}
            onClick={() => {
              if (isUiLocked) return;
              setEditClient({});
              updateSelectedImage(null);
              setShowForm(true);
            }}
          >
            Add Client
          </button>
        )}
        <button
          type="button"
          className="btn-download-excel"
          onClick={downloadFilteredClientsReport}
          disabled={isUiLocked}
        >
          Download Excel
        </button>
      </div>

      {showForm && (
        <div className="payment-modal-overlay">
          <div className="edit-client-modal">
            <form className="add-client-form" onSubmit={handleSaveClient}>
              <h2>{editClient?.id ? "Edit Client" : "Add Client"}</h2>
              <fieldset className="form-disabled-wrapper" disabled={isUiLocked}>
              <div className="add-client-field">
                <label htmlFor="client-name-input">Name</label>
                <input
                  id="client-name-input"
                  required
                  value={editClient?.name || ""}
                  onChange={(e) =>
                    setEditClient({ ...editClient, name: e.target.value })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-case-type-input">Case Type</label>
                <input
                  id="client-case-type-input"
                  value={editClient?.caseType || ""}
                  onChange={(e) =>
                    setEditClient({ ...editClient, caseType: e.target.value })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-phone-input">Phone Number</label>
                <input
                  id="client-phone-input"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  pattern="\d{10}"
                  title="Enter exactly 10 digits"
                  value={editClient?.phone || ""}
                  onChange={(e) =>
                    setEditClient({
                      ...editClient,
                      phone: normalizePhone(e.target.value),
                    })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-total-amount-input">Total Amount</label>
                <input
                  id="client-total-amount-input"
                  type="number"
                  required
                  value={editClient?.totalAmount || ""}
                  onChange={(e) =>
                    setEditClient({
                      ...editClient,
                      totalAmount: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-paid-amount-input">Paid Amount</label>
                <input
                  id="client-paid-amount-input"
                  type="number"
                  required
                  value={editClient?.paidAmount || ""}
                  onChange={(e) =>
                    setEditClient({
                      ...editClient,
                      paidAmount: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-due-date-input">Due Date</label>
                <input
                  id="client-due-date-input"
                  type="date"
                  required
                  value={editClient?.dueDate || ""}
                  onChange={(e) =>
                    setEditClient({ ...editClient, dueDate: e.target.value })
                  }
                />
              </div>
              <div className="add-client-field">
                <label htmlFor="client-remarks-input">Remarks</label>
                <textarea
                  id="client-remarks-input"
                  value={editClient?.remarks || ""}
                  onChange={(e) =>
                    setEditClient({ ...editClient, remarks: e.target.value })
                  }
                  placeholder="Any additional remarks..."
                />
              </div>
              <div className="image-upload-wrap">
                <label htmlFor="client-image-input">Upload Image</label>
                <input
                  id="client-image-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => prepareSelectedImage(e.target.files?.[0] || null)}
                />

              <div className="add-client-field" style={{ marginTop: '15px' }}>
                <label htmlFor="client-case-details-input">Case Details / Documents (Multiple)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    id="client-case-details-input"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setCaseDetailFiles(prev => [...prev, ...files]);
                    }}
                  />
                  {caseDetailFiles.length > 0 && (
                    <div className="staged-files-list" style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '4px',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      padding: '8px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {caseDetailFiles.map((file, idx) => (
                        <div key={idx} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          fontSize: '12px',
                          color: '#475569'
                        }}>
                          <span style={{ 
                            textOverflow: 'ellipsis', 
                            overflow: 'hidden', 
                            whiteSpace: 'nowrap',
                            maxWidth: '200px'
                          }}>
                            {file.name}
                          </span>
                          <button 
                            type="button" 
                            style={{ 
                              padding: '2px 6px', 
                              fontSize: '10px', 
                              color: '#ef4444',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setCaseDetailFiles(prev => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
                <div className="image-upload-actions">
                  <button
                    type="button"
                    className="btn-capture"
                    onClick={openCamera}
                    disabled={isCompressingImage}
                  >
                    Use Camera
                  </button>
                  {selectedImageFile && (
                    <button
                      type="button"
                      className="btn-remove-image"
                      onClick={() => updateSelectedImage(null)}
                      disabled={isCompressingImage}
                    >
                      Remove New Image
                    </button>
                  )}
                </div>
                {isCompressingImage && (
                  <small className="image-upload-note">Compressing image...</small>
                )}
                {(selectedImagePreview || editClient?.imageUrl) && (
                  <img
                    src={selectedImagePreview || getCardImageUrl(editClient?.imageUrl)}
                    alt="Selected client"
                    className="form-image-preview"
                  />
                )}
              </div>
              <div className="add-client-buttons">
                <button type="submit" className="btn-save" disabled={isCompressingImage}>
                  {isSaving || isCompressingImage ? "Processing..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowForm(false);
                    setEditClient(null);
                    updateSelectedImage(null);
                    closeCamera();
                  }}
                >
                  Cancel
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      <div className="clients-grid">
        {filteredClients.map((client) => {
          const isOverdue =
            client.balanceAmount > 0 &&
            client.dueDate &&
            new Date(client.dueDate) < new Date();

          return (
            <div
              key={client.id}
              ref={(node) => {
                if (node) {
                  clientCardRefs.current[client.id] = node;
                } else {
                  delete clientCardRefs.current[client.id];
                }
              }}
              className={`client-card ${isOverdue ? "overdue" : ""} ${
                highlightedClientId === client.id ? "client-card-focus" : ""
              }`}
            >
              <div className="client-main-row">
                <div className="client-top-panel">
                  <div className="client-header">
                    <h3>{client.name}</h3>
                    <span
                      className={`status-badge ${
                        isOverdue
                          ? "status-overdue"
                          : client.balanceAmount === 0
                          ? "status-paid"
                          : "status-partial"
                      }`}
                    >
                      {isOverdue ? "OVERDUE" : client.status}
                    </span>
                  </div>

                  <div className="client-photo-pane">
                    {client.imageUrl ? (
                      <button
                        type="button"
                        className="client-image-btn"
                        disabled={isUiLocked}
                        onClick={() => {
                          if (isUiLocked) return;
                          setExpandedImage({
                            url: client.imageUrl,
                            name: client.name,
                          });
                        }}
                      >
                        <img
                          src={getCardImageUrl(client.imageUrl)}
                          alt={`${client.name} document`}
                          className="client-image"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                        />
                      </button>
                    ) : (
                      <div className="client-image-placeholder">No Photo</div>
                    )}
                  </div>
                </div>

                <div className="client-details-area">
                  <div className="client-info-list">
                    <p><strong>Case:</strong> {client.caseType || "-"}</p>
                    <p><strong>Phone:</strong> {client.phone || "-"}</p>
                    <p><strong>Total:</strong> ₹ {new Intl.NumberFormat("en-IN").format(client.totalAmount)}</p>
                    <p><strong>Paid:</strong> ₹ {new Intl.NumberFormat("en-IN").format(client.paidAmount)}</p>
                    <p><strong>Balance:</strong> ₹ {new Intl.NumberFormat("en-IN").format(client.balanceAmount)}</p>
                    <p><strong>Due Date:</strong> {client.dueDate || "-"}</p>
                    <p className="client-added-meta">
                      <strong>Added On:</strong> {formatDateTime(client.createdAt)}
                    </p>
                    <p className="client-added-meta">
                      <strong>Added By:</strong> {client.createdByName || "-"}
                    </p>
                  </div>

                  {client.remarks && (
                    <div className="remarks-box">
                      <p >
                        <strong>Remarks: </strong>{client.remarks}
                      </p>
                    </div>
                  )}

                  {/* ================= CASE DOCUMENTS SECTION ================= */}
                  <div style={{ 
                    marginTop: '20px', 
                    padding: '16px', 
                    background: '#f8fafc', 
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>Case Details / Documents</span>
                      <span style={{ 
                        background: '#e2e8f0', 
                        color: '#475569', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {client.caseDetails?.length || 0} Files
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => setViewingDocsClient(client)}
                        type="button"
                        style={{
                          flex: 2,
                          background: '#fff',
                          color: '#1e293b',
                          border: '1px solid #cbd5e1',
                          padding: '10px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      >
                        📁 View Documents
                      </button>
                      
                      <label style={{ flex: 1, cursor: 'pointer' }}>
                        <input 
                          id={`quick-upload-${client.id}`}
                          type="file" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleQuickUpload(client.id, e.target.files?.[0])}
                          accept=".pdf,.doc,.docx,image/*"
                        />
                        <div style={{
                          background: '#ecf2ff',
                          color: '#2563eb',
                          border: '1px solid #dee9ff',
                          padding: '10px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#dfe9ff'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#ecf2ff'; }}
                        >
                          ➕ Add
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="follow-up-contact-row">
                    <label className="follow-up-check">
                      <input
                        type="checkbox"
                        checked={client.followUpContacted === true}
                        disabled={!canUpdateFollowUp || isUiLocked}
                        onChange={(e) =>
                          updateFollowUpContacted(client.id, e.target.checked)
                        }
                      />
                      Follow-up contacted
                    </label>
                    <small className="follow-up-meta">
                      Updated by: {client.followUpUpdatedBy || "-"} | {formatDateTime(client.followUpUpdatedAt)}
                    </small>
                  </div>
                </div>

              </div>

              <div className="client-actions">
                {role === "FOUNDER" && (
                  <>
                    <button
                      className="btn-edit"
                      disabled={isUiLocked}
                      onClick={() => {
                        if (isUiLocked) return;
                        setEditClient(client);
                        updateSelectedImage(null);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      disabled={isUiLocked}
                      onClick={() => deleteClient(client.id)}
                    >
                      Delete
                    </button>
                  </>
                )}

                {(role === "FOUNDER" || role === "ADMIN") && (
                  <>
                    <button
                      className="btn-update"
                      disabled={isUiLocked}
                      onClick={() => {
                        if (isUiLocked) return;
                        setSelectedClient(client);
                        setPaymentAmount("");
                        setPaymentMode("Cash");
                        setPaymentId("");
                        setNextDueDate("");
                        setShowPaymentModal(true);
                      }}
                    >
                      Update Payment
                    </button>
                    <button
                      className="btn-update"
                      disabled={isUiLocked}
                      onClick={() => {
                        if (isUiLocked) return;
                        setSelectedClient(client);
                        setRemarksText(client.remarks || "");
                        setShowRemarksModal(true);
                      }}
                    >
                      Update Remarks
                    </button>
                  </>
                )}
              </div>

              {client.payments?.length > 0 && (
                <div className="payment-history" style={{ marginTop: "15px" }}>
                  <strong>Payment History</strong>
                  <div className="payment-history-list">
                    {client.payments
                      ?.slice()
                      .sort((a, b) => {
                        const aTime = new Date(a?.updatedAt || a?.paymentDate || 0).getTime();
                        const bTime = new Date(b?.updatedAt || b?.paymentDate || 0).getTime();
                        return bTime - aTime;
                      })
                      .map((p) => (
                        <div key={p.id} className="payment-item">
                          ₹  {new Intl.NumberFormat("en-IN").format(p.amount)} /- ({p.paymentMode || "Cash"}{p.paymentId ? ` - ID: ${p.paymentId}` : ""})
                          <br />
                          Updated By: {p.updatedBy}
                          <br />
                          Updated At: {formatDateTime(p.updatedAt || p.paymentDate)}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {expandedImage && (
        <div
          className="image-preview-overlay"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="image-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="image-preview-close"
              onClick={() => setExpandedImage(null)}
            >
              Close
            </button>
            <img
              src={getExpandedImageUrl(expandedImage.url)}
              alt={`${expandedImage.name} document`}
              className="image-preview-large"
            />
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="camera-overlay" onClick={closeCamera}>
          <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
            <video
              ref={videoRef}
              className="camera-video"
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {cameraError && <p className="camera-error">{cameraError}</p>}
            <div className="camera-actions">
              <button
                type="button"
                className="btn-save"
                onClick={captureFromCamera}
                disabled={isUiLocked}
              >
                Capture
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={closeCamera}
                disabled={isUiLocked}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PAYMENT MODAL ================= */}
      {showPaymentModal && (
        <div
          className="payment-modal-overlay"
        >
        
          <div
            className="payment-modal"
          >
            <h3>Update Payment</h3>

            <div className="payment-field">
              <label htmlFor="payment-amount-input">Payment Amount</label>
              <input
                id="payment-amount-input"
                type="number"
                min="0"
                step="0.01"
                max={Number(selectedClient?.balanceAmount || 0)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                disabled={isUiLocked}
              />
            </div>
            <div className="payment-field">
              <label htmlFor="payment-mode-select">Payment Mode</label>
              <select
                id="payment-mode-select"
                value={paymentMode}
                onChange={(e) => {
                  setPaymentMode(e.target.value);
                  if (e.target.value === "Cash") setPaymentId("");
                }}
                disabled={isUiLocked}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {paymentMode !== "Cash" && (
              <div className="payment-field">
                <label htmlFor="payment-id-input">
                  {paymentMode === "Cheque" ? "Cheque Number" : "Transaction ID / Payment ID"}
                </label>
                <input
                  id="payment-id-input"
                  type="text"
                  placeholder={paymentMode === "UPI" ? "Enter UTR / UPI Ref No" : "Enter ID..."}
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  disabled={isUiLocked}
                />
              </div>
            )}
            <div className="payment-field">
              <label htmlFor="next-due-date-input">Next Due Date</label>
              <input
                id="next-due-date-input"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                disabled={isUiLocked}
              />
            </div>

            <div className="payment-modal-buttons">
              <button className="btn-save" onClick={handlePaymentUpdate} disabled={isUiLocked}>
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn-cancel"
                onClick={() => setShowPaymentModal(false)}
                disabled={isUiLocked}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= REMARKS MODAL ================= */}
      {/* ================= VIEW DOCUMENTS MODAL ================= */}
      {viewingDocsClient && (
        <div className="payment-modal-overlay">
          <div className="payment-modal" style={{ maxWidth: '550px', borderRadius: '16px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              padding: '24px',
              borderRadius: '16px 16px 0 0',
              color: 'white'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>📁 Case Files</h3>
                  <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '13px' }}>
                    {viewingDocsClient.name} • {viewingDocsClient.caseDetails?.length || 0} Documents
                  </p>
                </div>
                <button 
                  onClick={() => setViewingDocsClient(null)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px' }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {!viewingDocsClient.caseDetails || viewingDocsClient.caseDetails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                  <p>No documents found for this case.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {viewingDocsClient.caseDetails.map((doc) => (
                    <div key={doc.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.2s'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '28px' }}>
                          {doc.fileUrl.startsWith('data:image') ? '🖼️' : '📄'}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.fileName || "Document"}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            Added on {formatDateTime(doc.createdAt)}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                        <a 
                          href={doc.fileUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{
                            background: '#2563eb',
                            color: 'white',
                            textDecoration: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}
                        >
                          Open File
                        </a>
                        {role === "FOUNDER" && (
                          <button 
                            onClick={async () => {
                              if (window.confirm("Delete this document?")) {
                                try {
                                  await deleteCaseDetailAttachment(doc.id, viewingDocsClient.id);
                                  setViewingDocsClient(prev => ({
                                    ...prev,
                                    caseDetails: prev.caseDetails.filter(d => d.id !== doc.id)
                                  }));
                                } catch (e) {
                                  console.error("Delete failed", e);
                                }
                              }
                            }}
                            className="btn-delete-payment"
                            style={{ padding: '8px 12px' }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px' }}>
              <button 
                className="btn-save" 
                style={{ flex: 1 }}
                onClick={() => {
                  const input = document.getElementById(`quick-upload-${viewingDocsClient.id}`);
                  if (input) input.click();
                }}
              >
                ➕ Add New Document
              </button>
              <button className="btn-cancel" style={{ flex: 1 }} onClick={() => setViewingDocsClient(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemarksModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <h3>Update Remarks</h3>

            <div className="payment-field">
              <label htmlFor="remarks-textarea">Remarks</label>
              <textarea
                id="remarks-textarea"
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
                disabled={isUiLocked}
                placeholder="Enter remarks..."
              />
            </div>

            <div className="payment-modal-buttons">
              <button className="btn-save" onClick={handleUpdateRemarks} disabled={isUiLocked}>
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowRemarksModal(false);
                  setRemarksText("");
                  setSelectedClient(null);
                }}
                disabled={isUiLocked}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(isClientsLoading || isSaving) && (
        <div className="clients-busy-overlay" role="status" aria-live="polite">
          <div className="clients-busy-card">
            {isSaving ? "Please wait. Saving changes..." : "Loading clients..."}
          </div>
        </div>
      )}
    </div>
  );
}

export default Clients;
