import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "../api/axios";
import { Link, useNavigate } from "react-router-dom";
import { fullLogout, getUserEmail, getUserRole } from "../utils/auth";
import "./Dashboard.css";

const normalizeRole = (value) =>
  String(value || "")
    .replace(/^ROLE_/i, "")
    .trim()
    .toUpperCase();

const parseDateValue = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const date = raw.includes("T")
    ? new Date(raw)
    : new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getMonthKey = (date) => {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getClientPaymentsForMonth = (client, monthKey) => {
  const clientPayments = Array.isArray(client?.payments) ? client.payments : [];
  return clientPayments.reduce((sum, payment) => {
    const paymentDate = parseDateValue(payment?.paymentDate);
    if (!paymentDate) return sum;
    if (getMonthKey(paymentDate) !== monthKey) return sum;
    return sum + Number(payment?.amount || 0);
  }, 0);
};

const getPaymentMonthKey = (payment) => {
  const paymentDate = parseDateValue(payment?.paymentDate);
  if (paymentDate) return getMonthKey(paymentDate);
  const updatedDate = parseDateValue(payment?.updatedAt);
  if (updatedDate) return getMonthKey(updatedDate);
  return "";
};

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

  const rowsHtml = rows
    .map((row, rowIndex) => {
      const isSummaryRow = rowIndex < 4; // First 4 rows are summary
      return `<tr>${row
        .map((cell, cellIndex) => {
          const isCurrencyColumn = [4, 5, 6, 7, 1].includes(cellIndex); // Amount columns
          const cellValue = isCurrencyColumn && !isNaN(cell) ? formatNumberWithCommas(cell) : escapeCell(cell);
          const bgColor = isSummaryRow ? "#E6F2FF" : "#FFFFFF";
          const fontWeight = isSummaryRow ? "bold" : "normal";
          const textAlign = isCurrencyColumn ? "right" : "left";
          return `<td style="background-color: ${bgColor}; border: 1px solid #ccc; padding: 6px; text-align: ${textAlign}; font-weight: ${fontWeight};">${cellValue}</td>`;
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

function Dashboard() {
  const [notifications, setNotifications] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskInput, setTaskInput] = useState("");
  const [popups, setPopups] = useState([]);
  const [reportMonth, setReportMonth] = useState(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  });
  const [paymentLogMonth, setPaymentLogMonth] = useState(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  });
  const popupIdRef = useRef(0);

  const navigate = useNavigate();
  const email = getUserEmail() || "";
  const role = normalizeRole(getUserRole());
  const canUpdateFollowUp = role === "FOUNDER" || role === "ADMIN";

  const now = useMemo(() => new Date(), []);
  const monthLabel = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const nextMonthLabel = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString(
    "en-IN",
    { month: "long", year: "numeric" }
  );
  const selectedReportMonthDate = parseDateValue(`${reportMonth}-01`) || now;
  const selectedReportMonthKey = getMonthKey(selectedReportMonthDate);
  const selectedReportMonthLabel = selectedReportMonthDate.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayKey = useMemo(() => formatDateKey(now), [now]);
  const tomorrowKey = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return formatDateKey(date);
  }, [now]);

  const addPopup = useCallback((message, tone = "info") => {
    const id = `popup-${popupIdRef.current}`;
    popupIdRef.current += 1;
    setPopups((prev) => [...prev, { id, message, tone }]);

    window.setTimeout(() => {
      setPopups((prev) => prev.filter((popup) => popup.id !== id));
    }, 7000);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!email) return;
    try {
      const response = await axios.get("/notifications");
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log(error);
    }
  }, [email]);

  const fetchClients = useCallback(async () => {
    try {
      const response = await axios.get("/clients");
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.content || [];
      setClients(data);
    } catch (error) {
      console.log(error);
      setClients([]);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await axios.get("/tasks");
      setTasks(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log(error);
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchNotifications();
      void fetchClients();
      void fetchTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchNotifications, fetchClients, fetchTasks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchClients();
      fetchTasks();
      fetchNotifications();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [fetchNotifications, fetchClients, fetchTasks]);

  const dueTodayClients = useMemo(
    () =>
      clients.filter(
        (client) =>
          client?.dueDate === todayKey &&
          client?.status !== "PAID" &&
          Number(client?.balanceAmount || 0) > 0
      ),
    [clients, todayKey]
  );

  const dueTomorrowClients = useMemo(
    () =>
      clients.filter(
        (client) =>
          client?.dueDate === tomorrowKey &&
          client?.status !== "PAID" &&
          Number(client?.balanceAmount || 0) > 0
      ),
    [clients, tomorrowKey]
  );

  const pendingFollowUpClients = useMemo(() => {
    return clients
      .filter(
        (client) =>
          client?.status !== "PAID" &&
          Number(client?.balanceAmount || 0) > 0 &&
          client?.followUpContacted !== true
      )
      .sort((a, b) => {
        const aDate = parseDateValue(a?.dueDate);
        const bDate = parseDateValue(b?.dueDate);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.getTime() - bDate.getTime();
      });
  }, [clients]);

  const totalClients = clients.length;

  const overdueClients = useMemo(() => {
    return clients.filter((client) => {
      // Match the exact logic from Clients.jsx
      return (
        client.balanceAmount > 0 &&
        client.dueDate &&
        new Date(client.dueDate) < new Date()
      );
    }).length;
  }, [clients]);

  const allPaymentUpdates = useMemo(() => {
    return clients
      .flatMap((client) => {
        const clientPayments = Array.isArray(client?.payments) ? client.payments : [];
        return clientPayments.map((payment) => ({
          ...payment,
          clientId: client?.id,
          clientName: client?.name || "-",
        }));
      })
      .sort((a, b) => {
        const aDate = parseDateValue(a?.updatedAt) || parseDateValue(a?.paymentDate);
        const bDate = parseDateValue(b?.updatedAt) || parseDateValue(b?.paymentDate);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate.getTime() - aDate.getTime();
      });
  }, [clients]);

  const monthlyTargetAmount = useMemo(() => {
    const currentMonthKey = getMonthKey(now);

    return clients.reduce((sum, client) => {
      const dueDate = parseDateValue(client?.dueDate);
      if (!dueDate || getMonthKey(dueDate) !== currentMonthKey) return sum;

      // Monthly target strictly from clients whose due date is in the month.
      return sum + Math.max(0, Number(client?.totalAmount || 0));
    }, 0);
  }, [clients, now]);

  const monthlyReceivedAmount = useMemo(() => {
    const currentMonthKey = getMonthKey(now);
    return allPaymentUpdates.reduce((sum, payment) => {
      if (getPaymentMonthKey(payment) !== currentMonthKey) return sum;
      return sum + Number(payment?.amount || 0);
    }, 0);
  }, [allPaymentUpdates, now]);

  const targetAchievedPercentage = useMemo(() => {
    if (monthlyTargetAmount <= 0) return 0;
    return (monthlyReceivedAmount / monthlyTargetAmount) * 100;
  }, [monthlyReceivedAmount, monthlyTargetAmount]);

  const nextMonthTargetAmount = useMemo(() => {
    const nextMonthDateRef = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthKey = getMonthKey(nextMonthDateRef);

    return clients.reduce((sum, client) => {
      const dueDate = parseDateValue(client?.dueDate);
      if (!dueDate || getMonthKey(dueDate) !== nextMonthKey) return sum;

      return sum + Math.max(0, Number(client?.totalAmount || 0));
    }, 0);
  }, [clients, now]);

  const filteredPaymentUpdates = useMemo(() => {
    return allPaymentUpdates.filter(
      (payment) => getPaymentMonthKey(payment) === paymentLogMonth
    );
  }, [allPaymentUpdates, paymentLogMonth]);

  const filteredPaymentTotal = useMemo(() => {
    return filteredPaymentUpdates.reduce((sum, payment) => {
      return sum + Number(payment?.amount || 0);
    }, 0);
  }, [filteredPaymentUpdates]);

  const monthlyReportClients = clients.filter((client) => {
    const dueDate = parseDateValue(client?.dueDate);
    return dueDate && getMonthKey(dueDate) === selectedReportMonthKey;
  });

  const downloadDashboardMonthlyReport = () => {
    const reportPayments = allPaymentUpdates.filter(
      (payment) => getPaymentMonthKey(payment) === selectedReportMonthKey
    );

    if (monthlyReportClients.length === 0 && reportPayments.length === 0) {
      addPopup(`No clients found for ${selectedReportMonthLabel}.`, "warning");
      return;
    }

    const reportTarget = monthlyReportClients.reduce((sum, client) => {
      return sum + Math.max(0, Number(client?.totalAmount || 0));
    }, 0);

    const reportReceived = reportPayments.reduce(
      (sum, payment) => sum + Number(payment?.amount || 0),
      0
    );

    const reportPercent = reportTarget > 0 ? (reportReceived / reportTarget) * 100 : 0;

    const rows = monthlyReportClients.map((client) => [
      client?.name || "-",
      client?.caseType || "-",
      client?.phone || "-",
      client?.dueDate || "-",
      Number(client?.totalAmount || 0),
      Number(client?.paidAmount || 0),
      Number(client?.balanceAmount || 0),
      getClientPaymentsForMonth(client, selectedReportMonthKey),
      client?.status || "-",
      client?.followUpContacted ? "Yes" : "No",
      client?.followUpUpdatedBy || "-",
      formatDateTime(client?.followUpUpdatedAt),
    ]);

    rows.unshift([
      "Month Summary",
      selectedReportMonthLabel,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    rows.unshift([
      "Target Achieved (%)",
      reportPercent.toFixed(1),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    rows.unshift([
      "Monthly Received",
      reportReceived,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    rows.unshift([
      "Monthly Target",
      reportTarget,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    downloadExcel(
      `Dashboard Report - ${selectedReportMonthLabel}`,
      [
        "Client Name",
        "Case Type",
        "Phone",
        "Due Date",
        "Total Amount",
        "Paid Amount",
        "Balance Amount",
        "Received In Report Month",
        "Status",
        "Follow-up Contacted",
        "Follow-up Updated By",
        "Follow-up Updated At",
      ],
      rows,
      `dashboard-report-${selectedReportMonthKey}`
    );
  };

  const downloadCommonPaymentUpdatesExcel = () => {
    if (filteredPaymentUpdates.length === 0) {
      addPopup("No common payment updates available for selected month.", "warning");
      return;
    }

    const rows = filteredPaymentUpdates.map((payment) => [
      payment?.clientName || "-",
      Number(payment?.amount || 0),
      payment?.paymentDate || "-",
      payment?.updatedBy || "-",
      formatDateTime(payment?.updatedAt || payment?.paymentDate),
      payment?.id || "-",
    ]);

    rows.unshift(["Total Received", filteredPaymentTotal, "", "", "", ""]);
    rows.unshift(["Month", paymentLogMonth, "", "", "", ""]);

    downloadExcel(
      `Common Payment Updates - ${paymentLogMonth}`,
      ["Client Name", "Amount", "Payment Date", "Updated By", "Updated At", "Payment ID"],
      rows,
      `common-payment-updates-${paymentLogMonth}`
    );
  };

  const sendMonthlyReportEmail = async (monthValue) => {
    try {
      const response = await axios.post(`/reports/monthly/${monthValue}/send`);
      addPopup(response.data, "info");
    } catch (error) {
      let errorMsg = "Failed to send report email";
      
      if (error?.response) {
        const { data } = error.response;
        if (typeof data === "string") {
          errorMsg = data;
        } else if (data?.message) {
          errorMsg = data.message;
        } else if (data?.error) {
          errorMsg = data.error;
        }
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      addPopup(errorMsg, "warning");
    }
  };

  useEffect(() => {
    const todayPopupKey = `dashboard_due_today_${todayKey}`;
    if (dueTodayClients.length > 0 && !sessionStorage.getItem(todayPopupKey)) {
      const names = dueTodayClients
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ");
      const extra = dueTodayClients.length > 3 ? ` +${dueTodayClients.length - 3} more` : "";
      addPopup(`Payment due today: ${names}${extra}`, "urgent");
      sessionStorage.setItem(todayPopupKey, "1");
    }

    const tomorrowPopupKey = `dashboard_due_tomorrow_${tomorrowKey}`;
    if (dueTomorrowClients.length > 0 && !sessionStorage.getItem(tomorrowPopupKey)) {
      const names = dueTomorrowClients
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ");
      const extra = dueTomorrowClients.length > 3 ? ` +${dueTomorrowClients.length - 3} more` : "";
      addPopup(`24-hour prior alert: Payment due tomorrow for ${names}${extra}`, "warning");
      sessionStorage.setItem(tomorrowPopupKey, "1");
    }
  }, [addPopup, dueTodayClients, dueTomorrowClients, todayKey, tomorrowKey]);

  const handleLogout = () => {
    fullLogout();
    navigate("/", { replace: true });
  };

  const markNotificationRead = async (id) => {
    try {
      await axios.put(`/notifications/read/${id}`);
      setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    } catch (error) {
      console.log(error);
    }
  };

  const openClientCard = (clientId) => {
    navigate(`/clients?clientId=${clientId}`);
  };

  const updateFollowUpContacted = async (clientId, contacted) => {
    try {
      await axios.put(`/clients/${clientId}/follow-up`, { contacted });
      setClients((prev) =>
        prev.map((client) =>
          client.id === clientId
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
      console.log(error);
      addPopup("Failed to update follow-up status.", "warning");
    }
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    const createTask = async () => {
      const value = taskInput.trim();
      if (!value) return;

      try {
        await axios.post("/tasks", { title: value });
        setTaskInput("");
        fetchTasks();
      } catch (error) {
        console.log(error);
        addPopup("Failed to add task.", "warning");
      }
    };

    createTask();
  };

  const toggleTask = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    const updateTask = async () => {
      try {
        await axios.put(`/tasks/${id}`, { completed: !task.completed });
        fetchTasks();
      } catch (error) {
        console.log(error);
        addPopup("Failed to update task.", "warning");
      }
    };

    updateTask();
  };

  const removeTask = (id) => {
    const deleteTask = async () => {
      try {
        await axios.delete(`/tasks/${id}`);
        fetchTasks();
      } catch (error) {
        console.log(error);
        addPopup("Failed to delete task.", "warning");
      }
    };

    deleteTask();
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

  const formatCurrency = (value) => `INR ${currencyFormatter.format(Number(value || 0))}`;

  const renderFollowItem = (client, keyPrefix) => (
    <li key={`${keyPrefix}-${client.id}`}>
      <div className="follow-item-top">
        <button
          type="button"
          className="follow-client-link"
          onClick={() => openClientCard(client.id)}
        >
          {client.name}
        </button>
        <span className="follow-amount">{formatCurrency(client.balanceAmount)}</span>
      </div>
      <div className="follow-item-bottom">
        <span className="follow-due-tag">Due: {client.dueDate || "-"}</span>
        <label className="follow-checkbox">
            <input
              type="checkbox"
              checked={client.followUpContacted === true}
              disabled={!canUpdateFollowUp}
              onChange={(e) => updateFollowUpContacted(client.id, e.target.checked)}
          />
          Contacted
        </label>
      </div>
      <small className="follow-meta">
        Updated by: {client.followUpUpdatedBy || "-"} | {formatDateTime(client.followUpUpdatedAt)}
      </small>
    </li>
  );

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        <aside className="dashboard-left">
          <section className="dashboard-card profile-card">
            <div className="profile-top">
              <div className="profile-avatar">{(email[0] || "U").toUpperCase()}</div>
              <div>
                <h3>Profile</h3>
                <p className="profile-email">{email || "unknown@lawoffice.com"}</p>
                <span className="profile-role">{role || "USER"}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="dashboard-logout profile-logout">
              Logout
            </button>
          </section>

          <section className="dashboard-card">
            <h3>Follow Up</h3>

            <div className="follow-section">
              <h4>Due Today ({dueTodayClients.length})</h4>
              {dueTodayClients.length === 0 ? (
                <p className="empty-text">No clients due today.</p>
              ) : (
                <ul className="follow-list">
                  {dueTodayClients.map((client) => renderFollowItem(client, "today"))}
                </ul>
              )}
            </div>

            <div className="follow-section">
              <h4>Due Tomorrow (24h Prior) ({dueTomorrowClients.length})</h4>
              {dueTomorrowClients.length === 0 ? (
                <p className="empty-text">No clients due tomorrow.</p>
              ) : (
                <ul className="follow-list">
                  {dueTomorrowClients.map((client) => renderFollowItem(client, "tomorrow"))}
                </ul>
              )}
            </div>
            <div className="follow-section">
              <h4>Pending Follow Up ({pendingFollowUpClients.length})</h4>
              {pendingFollowUpClients.length === 0 ? (
                <p className="empty-text">No pending follow-up clients.</p>
              ) : (
                <ul className="follow-list">
                  {pendingFollowUpClients.slice(0, 8).map((client) =>
                    renderFollowItem(client, "pending")
                  )}
                </ul>
              )}
            </div>
          </section>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <h2>Dashboard Overview</h2>
              <p>{monthLabel} financial and follow-up summary</p>
            </div>
            <div className="dashboard-actions">
              <div className="report-controls">
                <label htmlFor="dashboard-report-month">Report Month</label>
                <input
                  id="dashboard-report-month"
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="report-month-input"
                />
                <button
                  type="button"
                  className="report-download-btn"
                  onClick={downloadDashboardMonthlyReport}
                >
                  Download Excel
                </button>
                {(role === "FOUNDER" || role === "ADMIN") && (
                  <button
                    type="button"
                    className="report-download-btn"
                    onClick={() => sendMonthlyReportEmail(reportMonth)}
                    title="Send report to founder email"
                  >
                    Send Email
                  </button>
                )}
              </div>
              <Link to="/clients" className="dashboard-link">
                Go to Clients
              </Link>
            </div>
          </header>

          <section className="metrics-grid">
            <article className="metric-card tone-blue">
              <p>Total Clients</p>
              <h4>{totalClients}</h4>
            </article>
            <article className="metric-card tone-red">
              <p>Overdue Clients</p>
              <h4>{overdueClients}</h4>
            </article>
            <article className="metric-card tone-indigo">
              <p>{monthLabel} Target</p>
              <h4>{formatCurrency(monthlyTargetAmount)}</h4>
            </article>
            <article className="metric-card tone-green">
              <p>{monthLabel} Received</p>
              <h4>{formatCurrency(monthlyReceivedAmount)}</h4>
            </article>
            <article className="metric-card tone-orange">
              <p>Target Achieved</p>
              <h4>{targetAchievedPercentage.toFixed(1)}%</h4>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, targetAchievedPercentage))}%` }}
                />
              </div>
            </article>
            <article className="metric-card tone-violet">
              <p>{nextMonthLabel} Target</p>
              <h4>{formatCurrency(nextMonthTargetAmount)}</h4>
            </article>
          </section>

          <section className="dashboard-card">
            <h3>Notifications ({notifications.length})</h3>
            <div className="today-pending-box">
              <h4>Today Pending List ({dueTodayClients.length})</h4>
              {dueTodayClients.length === 0 ? (
                <p className="empty-text">No pending clients for today.</p>
              ) : (
                <ul className="today-pending-list">
                  {dueTodayClients.map((client) => (
                    <li key={`notify-today-${client.id}`}>
                      <button
                        type="button"
                        className="today-pending-name"
                        onClick={() => openClientCard(client.id)}
                      >
                        {client.name}
                      </button>
                      <span className="today-pending-amount">
                        {formatCurrency(client.balanceAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="empty-text">No new notifications.</p>
            ) : (
              <div className="notification-list">
                {notifications.map((notification) => (
                  <div key={notification.id} className="notification-item">
                    <p>{notification.message}</p>
                    <button
                      type="button"
                      onClick={() => markNotificationRead(notification.id)}
                    >
                      Mark Read
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-card">
            <h3>Tasks To Do</h3>
            <form className="task-form" onSubmit={handleAddTask}>
              <label htmlFor="dashboard-task-input">Task</label>
              <div className="task-input-row">
                <input
                  id="dashboard-task-input"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                />
                <button type="submit">Add</button>
              </div>
            </form>

            {tasks.length === 0 ? (
              <p className="empty-text">No tasks yet.</p>
            ) : (
              <ul className="task-list">
                {tasks.map((task) => (
                  <li key={task.id} className={task.completed ? "done" : ""}>
                    <label>
                      <input
                        type="checkbox"
                        checked={task.completed === true}
                        onChange={() => toggleTask(task.id)}
                      />
                      <span>{task.title}</span>
                    </label>
                    <small className="task-meta">
                      By: {task.updatedBy || task.createdBy || "-"} |{" "}
                      {formatDateTime(task.updatedAt || task.createdAt)}
                    </small>
                    <button type="button" onClick={() => removeTask(task.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="payment-update-block">
              <div className="payment-update-header">
                <div>
                  <h4>Common Payment Updates</h4>
                  <p className="payment-update-total">
                    Total Received: {formatCurrency(filteredPaymentTotal)}
                  </p>
                </div>
                <div className="payment-update-actions">
                  <input
                    type="month"
                    value={paymentLogMonth}
                    onChange={(e) => setPaymentLogMonth(e.target.value)}
                    className="payment-update-month-input"
                    
                  />
                  <button
                    type="button"
                    className="payment-update-download-btn"
                    onClick={downloadCommonPaymentUpdatesExcel}
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              {filteredPaymentUpdates.length === 0 ? (
                <p className="empty-text">No payment updates for this month.</p>
              ) : (
                <ul className="payment-update-list">
                  {filteredPaymentUpdates.map((payment) => (
                    <li key={`payment-log-${payment.clientId}-${payment.id}`}>
                      <button
                        type="button"
                        className="payment-update-client"
                        onClick={() => openClientCard(payment.clientId)}
                      >
                        {payment.clientName}
                      </button>
                      <span className="payment-update-amount">
                        {formatCurrency(payment.amount)}
                      </span>
                      <small className="payment-update-meta">
                        By: {payment.updatedBy || "-"} |{" "}
                        {formatDateTime(payment.updatedAt || payment.paymentDate)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>

      <div className="popup-stack">
        {popups.map((popup) => (
          <div key={popup.id} className={`popup-item ${popup.tone}`}>
            {popup.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
