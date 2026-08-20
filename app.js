document.addEventListener('DOMContentLoaded', () => {
  // --- App State ---
  let expenses = [];
  let currentReceiptData = null;
  let domainChartInstance = null;
  let categoryChartInstance = null;

  // --- DOM Elements ---
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  const modeTextBtn = document.getElementById('mode-text');
  const modeReceiptBtn = document.getElementById('mode-receipt');
  const textInputGroup = document.getElementById('text-input-group');
  const receiptInputGroup = document.getElementById('receipt-input-group');
  const expenseForm = document.getElementById('expense-form');
  const expenseText = document.getElementById('expense-text');
  const expenseDate = document.getElementById('expense-date');
  const expenseAmount = document.getElementById('expense-amount');
  
  const dropzone = document.getElementById('dropzone');
  const receiptFileInput = document.getElementById('receipt-file');
  const receiptPreviewContainer = document.getElementById('receipt-preview-container');
  const receiptPreview = document.getElementById('receipt-preview');
  const removeReceiptBtn = document.getElementById('remove-receipt');

  const outputContainer = document.getElementById('output-container');
  const lastUpdatedBadge = document.getElementById('last-updated-badge');
  const pillBtns = document.querySelectorAll('.pill-btn');

  const expenseTableBody = document.getElementById('expense-table-body');
  const searchInput = document.getElementById('search-input');
  const filterDomain = document.getElementById('filter-domain');
  const filterDeductible = document.getElementById('filter-deductible');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnClearAll = document.getElementById('btn-clear-all');

  // Set default date to today
  if (expenseDate) {
    expenseDate.valueAsDate = new Date();
  }

  // --- Initial Load ---
  fetchExpenses();

  // --- Navigation Tab Switching ---
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'dashboard-tab') {
        renderCharts();
      }
    });
  });

  // --- Input Mode Toggle ---
  modeTextBtn.addEventListener('click', () => {
    modeTextBtn.classList.add('active');
    modeReceiptBtn.classList.remove('active');
    textInputGroup.classList.remove('hidden');
    receiptInputGroup.classList.add('hidden');
    expenseText.required = true;
  });

  modeReceiptBtn.addEventListener('click', () => {
    modeReceiptBtn.classList.add('active');
    modeTextBtn.classList.remove('active');
    receiptInputGroup.classList.remove('hidden');
    textInputGroup.classList.add('hidden');
    expenseText.required = false;
  });

  // --- Quick Test Inputs ---
  pillBtns.forEach(pill => {
    pill.addEventListener('click', () => {
      expenseText.value = pill.getAttribute('data-text');
    });
  });

  // --- Drag & Drop Receipt Reader ---
  dropzone.addEventListener('click', () => receiptFileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-color)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleReceiptFile(e.dataTransfer.files[0]);
    }
  });

  receiptFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleReceiptFile(e.target.files[0]);
    }
  });

  removeReceiptBtn.addEventListener('click', () => {
    currentReceiptData = null;
    receiptFileInput.value = '';
    receiptPreviewContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
  });

  function handleReceiptFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentReceiptData = event.target.result;
      receiptPreview.src = currentReceiptData;
      dropzone.classList.add('hidden');
      receiptPreviewContainer.classList.remove('hidden');
      
      // Auto fill mock scanned values if text is empty
      if (!expenseText.value) {
        expenseText.value = `Scanned receipt from ${file.name.split('.')[0].replace(/[-_]/g, ' ')}`;
      }
    };
    reader.readAsDataURL(file);
  }

  // --- Submit Expense Form ---
  expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = expenseText.value.trim();
    if (!text && !currentReceiptData) return;

    let manualAmount = parseFloat(expenseAmount.value);
    let dateVal = expenseDate.value || new Date().toISOString().split('T')[0];

    // Classify expense via Server API or local engine
    let classification = await classifyExpense(text);

    // Extract amount from text if not manually provided
    let amount = isNaN(manualAmount) ? extractAmountFromText(text) : manualAmount;
    let merchant = extractMerchantFromText(text);

    const newExpense = {
      id: 'exp_' + Date.now(),
      merchant: merchant,
      text: text,
      amount: amount,
      date: dateVal,
      domain: classification.domain,
      category: classification.category,
      deductible: classification.deductible,
      tax_category: classification.tax_category,
      tax_tip: classification.tax_tip,
      hasReceipt: !!currentReceiptData,
      createdAt: new Date().toISOString()
    };

    // Save
    await saveExpense(newExpense);

    // Render exact FinAI formatted result
    renderFinAIOutput(newExpense);

    // Reset Form
    expenseText.value = '';
    expenseAmount.value = '';
    removeReceiptBtn.click();
    
    lastUpdatedBadge.textContent = 'Just Logged';
    lastUpdatedBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    lastUpdatedBadge.style.color = '#34d399';
  });

  // --- FinAI Rule Classification ---
  async function classifyExpense(text) {
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.log('Using client-side classification fallback');
    }

    // Client-side fallback classification
    const lower = text.toLowerCase();
    let domain = "WORK";
    let category = "Office Expense";
    let deductible = "YES (100%)";
    let tax_category = "Schedule C - Office Expense";
    let tax_tip = "Business expense eligible for 100% tax deduction.";

    if (lower.includes('grocery') || lower.includes('groceries') || lower.includes('supermarket') || lower.includes('casual') || lower.includes('movie')) {
      domain = "PERSONAL";
      category = "Household / Groceries";
      deductible = "NO";
      tax_category = "None";
      tax_tip = "Personal living expenses are non-deductible under tax rules.";
    } else if (lower.includes('coffee') || lower.includes('starbucks') || lower.includes('lunch') || lower.includes('dinner') || lower.includes('restaurant')) {
      domain = "WORK";
      category = "Client Meal";
      deductible = "YES (50%)";
      tax_category = "Schedule C - Meals";
      tax_tip = "Business meals with clients or during work travel are 50% tax deductible. Keep notes on attendees and topics.";
    } else if (lower.includes('laptop') || lower.includes('ram') || lower.includes('computer') || lower.includes('monitor')) {
      domain = "WORK";
      category = "Hardware & Equipment";
      deductible = "YES (100%)";
      tax_category = "Schedule C - Depreciable Assets / Sec 179";
      tax_tip = "Eligible for 100% deduction in year of purchase under Section 179 bonus depreciation.";
    }

    return { domain, category, deductible, tax_category, tax_tip };
  }

  function extractAmountFromText(text) {
    const match = text.match(/\$\s?([0-9,]+(\.[0-9]{2})?)|([0-9]+)\s?(bucks|dollars)/i);
    if (match) {
      if (match[1]) return parseFloat(match[1].replace(',', ''));
      if (match[3]) return parseFloat(match[3]);
    }
    return 25.00; // default placeholder if unparsed
  }

  function extractMerchantFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('starbucks')) return 'Starbucks';
    if (lower.includes('grocery') || lower.includes('supermarket')) return 'Grocery Store';
    if (lower.includes('laptop') || lower.includes('macbook')) return 'Electronics Vendor';
    if (lower.includes('aws') || lower.includes('amazon web')) return 'AWS Web Services';
    if (lower.includes('google')) return 'Google';
    
    // Extract first 4 words as item/merchant
    const words = text.split(' ').slice(0, 4).join(' ');
    return words.length > 25 ? words.substring(0, 25) + '...' : words;
  }

  // --- Render FinAI Logged Output Card (Exact Format Requested) ---
  function renderFinAIOutput(exp) {
    const formattedAmount = `$${exp.amount.toFixed(2)}`;
    const domainClass = exp.domain === 'WORK' ? 'domain-work' : 'domain-personal';
    const deductClass = exp.deductible.includes('100%') ? 'val-green' : exp.deductible.includes('50%') ? 'val-amber' : 'val-red';

    outputContainer.innerHTML = `
      <div class="finai-output-box">
        <div class="finai-output-header">
          <span style="font-size: 24px;">🧾</span>
          <h3>Expense Logged</h3>
        </div>

        <div class="finai-field-list">
          <div class="finai-field-item ${domainClass}">
            <span class="finai-label">Merchant / Item:</span>
            <span class="finai-val">${exp.merchant} (${exp.text})</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Amount:</span>
            <span class="finai-val val-highlight">${formattedAmount}</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Date:</span>
            <span class="finai-val">${exp.date}</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Domain:</span>
            <span class="finai-val ${exp.domain === 'WORK' ? 'val-green' : 'val-red'}">${exp.domain}</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Category:</span>
            <span class="finai-val">${exp.category}</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Tax Deductible?</span>
            <span class="finai-val ${deductClass}">${exp.deductible}</span>
          </div>

          <div class="finai-field-item">
            <span class="finai-label">Tax Category:</span>
            <span class="finai-val">${exp.tax_category}</span>
          </div>
        </div>

        <div class="finai-tip-box">
          💡 <strong>Tax Tip / Summary:</strong> ${exp.tax_tip}
        </div>
      </div>
    `;
  }

  // --- Data Persistence ---
  const INITIAL_EXPENSES = [
    {
      id: "exp_1003",
      merchant: "Grocery Store",
      text: "Spent $60 at the grocery store for weekly food supplies.",
      amount: 60.00,
      date: new Date().toISOString().split('T')[0],
      domain: "PERSONAL",
      category: "Household / Groceries",
      deductible: "NO",
      tax_category: "None",
      tax_tip: "Personal living expenses such as home groceries are non-deductible personal expenditures under standard tax rules.",
      hasReceipt: false,
      createdAt: new Date().toISOString()
    },
    {
      id: "exp_1002",
      merchant: "Electronics Vendor",
      text: "Bought a brand new 32GB RAM laptop for $1,200 to handle client video editing and freelance projects.",
      amount: 1200.00,
      date: new Date().toISOString().split('T')[0],
      domain: "WORK",
      category: "Hardware & Equipment",
      deductible: "YES (100%)",
      tax_category: "Schedule C - Depreciable Assets / Sec 179",
      tax_tip: "Work hardware purchased exclusively for business operations is 100% tax deductible, and under Section 179 you may be able to write off the full $1,200 in the current tax year.",
      hasReceipt: false,
      createdAt: new Date().toISOString()
    },
    {
      id: "exp_1001",
      merchant: "Starbucks",
      text: "Just spent 25 bucks at Starbucks having coffee with a new client to discuss a project.",
      amount: 25.00,
      date: new Date().toISOString().split('T')[0],
      domain: "WORK",
      category: "Client Meal",
      deductible: "YES (50%)",
      tax_category: "Schedule C - Meals",
      tax_tip: "Business meals with prospective clients are 50% tax-deductible; be sure to keep a brief note of the client's name and business topic discussed alongside the receipt for audit purposes.",
      hasReceipt: false,
      createdAt: new Date().toISOString()
    }
  ];

  async function fetchExpenses() {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        expenses = await res.json();
      } else {
        loadFromLocalStorage();
      }
    } catch (err) {
      loadFromLocalStorage();
    }
    updateUI();
  }

  function loadFromLocalStorage() {
    const stored = localStorage.getItem('finai_expenses');
    if (stored) {
      expenses = JSON.parse(stored);
    } else {
      expenses = INITIAL_EXPENSES;
      localStorage.setItem('finai_expenses', JSON.stringify(expenses));
    }
  }

  async function saveExpense(expense) {
    expenses.unshift(expense);
    localStorage.setItem('finai_expenses', JSON.stringify(expenses));

    try {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense)
      });
    } catch (err) {
      console.log('Saved to localStorage fallback');
    }
    updateUI();
  }

  async function deleteExpense(id) {
    expenses = expenses.filter(e => e.id !== id);
    localStorage.setItem('finai_expenses', JSON.stringify(expenses));

    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.log('Deleted locally');
    }
    updateUI();
  }

  // --- Update UI & Views ---
  function updateUI() {
    renderTable();
    renderScheduleC();
    updateKPICards();
  }

  // --- Database Table ---
  function renderTable() {
    if (!expenseTableBody) return;

    const searchTerm = searchInput.value.toLowerCase();
    const domainVal = filterDomain.value;
    const deductibleVal = filterDeductible.value;

    const filtered = expenses.filter(exp => {
      const matchSearch = exp.merchant.toLowerCase().includes(searchTerm) || 
                          exp.category.toLowerCase().includes(searchTerm) || 
                          exp.text.toLowerCase().includes(searchTerm);
      const matchDomain = domainVal === 'ALL' || exp.domain === domainVal;
      const matchDeductible = deductibleVal === 'ALL' || exp.deductible === deductibleVal;
      return matchSearch && matchDomain && matchDeductible;
    });

    if (filtered.length === 0) {
      expenseTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">No matching expense records found.</td></tr>`;
      return;
    }

    expenseTableBody.innerHTML = filtered.map(exp => `
      <tr>
        <td>${exp.date}</td>
        <td><strong>${exp.merchant}</strong><br><small style="color:var(--text-sub);">${exp.text}</small></td>
        <td><span class="domain-pill ${exp.domain}">${exp.domain}</span></td>
        <td>${exp.category}</td>
        <td><strong>$${exp.amount.toFixed(2)}</strong></td>
        <td>${exp.deductible}</td>
        <td>${exp.tax_category}</td>
        <td>
          <button class="btn-sm btn-danger btn-del" data-id="${exp.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteExpense(id);
      });
    });
  }

  // Filter Event Listeners
  if (searchInput) searchInput.addEventListener('input', renderTable);
  if (filterDomain) filterDomain.addEventListener('change', renderTable);
  if (filterDeductible) filterDeductible.addEventListener('change', renderTable);

  // --- Export CSV & Clear ---
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      if (expenses.length === 0) return alert('No expenses to export.');
      
      const headers = ['Date', 'Merchant', 'Description', 'Amount', 'Domain', 'Category', 'Deductible', 'Tax Category'];
      const rows = expenses.map(e => [
        `"${e.date}"`,
        `"${e.merchant.replace(/"/g, '""')}"`,
        `"${e.text.replace(/"/g, '""')}"`,
        e.amount.toFixed(2),
        `"${e.domain}"`,
        `"${e.category}"`,
        `"${e.deductible}"`,
        `"${e.tax_category}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `FinAI_Expenses_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all stored expense records?')) {
        expenses = [];
        localStorage.removeItem('finai_expenses');
        fetch('/api/expenses', { method: 'DELETE' });
        updateUI();
      }
    });
  }

  // --- Schedule C Tax Summary ---
  function renderScheduleC() {
    const schLinesContainer = document.getElementById('schedule-c-lines');
    if (!schLinesContainer) return;

    let grossWork = 0;
    let totalDeductible = 0;
    let categories = {
      'Line 8 - Advertising': 0,
      'Line 13 - Depreciable Assets / Hardware': 0,
      'Line 18 - Office Expenses & Software': 0,
      'Line 24b - Business Meals (50%)': 0,
      'Line 25 - Utilities & Internet': 0,
      'Line 27a - Other Business Expenses': 0
    };

    expenses.forEach(exp => {
      if (exp.domain === 'WORK') {
        grossWork += exp.amount;
        let deductibleAmount = exp.amount;

        if (exp.deductible.includes('50%')) {
          deductibleAmount = exp.amount * 0.5;
        } else if (exp.deductible.includes('PARTIAL')) {
          deductibleAmount = exp.amount * 0.5;
        } else if (exp.deductible.includes('NO')) {
          deductibleAmount = 0;
        }

        totalDeductible += deductibleAmount;

        if (exp.tax_category.includes('Advertising')) {
          categories['Line 8 - Advertising'] += deductibleAmount;
        } else if (exp.tax_category.includes('Depreciable') || exp.tax_category.includes('Sec 179')) {
          categories['Line 13 - Depreciable Assets / Hardware'] += deductibleAmount;
        } else if (exp.tax_category.includes('Meals')) {
          categories['Line 24b - Business Meals (50%)'] += deductibleAmount;
        } else if (exp.tax_category.includes('Utilities')) {
          categories['Line 25 - Utilities & Internet'] += deductibleAmount;
        } else if (exp.tax_category.includes('Office') || exp.tax_category.includes('Software')) {
          categories['Line 18 - Office Expenses & Software'] += deductibleAmount;
        } else {
          categories['Line 27a - Other Business Expenses'] += deductibleAmount;
        }
      }
    });

    schLinesContainer.innerHTML = Object.keys(categories).map(line => `
      <div class="sch-line-item">
        <div class="sch-line-info">
          <h4>${line}</h4>
          <p>Schedule C Tax Deduction Line</p>
        </div>
        <span class="sch-line-val">$${categories[line].toFixed(2)}</span>
      </div>
    `).join('');

    document.getElementById('tax-gross-work').textContent = `$${grossWork.toFixed(2)}`;
    document.getElementById('tax-deductible-total').textContent = `$${totalDeductible.toFixed(2)}`;
    document.getElementById('tax-est-savings').textContent = `$${(totalDeductible * 0.25).toFixed(2)}`;
  }

  // --- KPI Cards & Analytics ---
  function updateKPICards() {
    let total = 0;
    let workTotal = 0;
    let deductibleTotal = 0;

    expenses.forEach(e => {
      total += e.amount;
      if (e.domain === 'WORK') {
        workTotal += e.amount;
        if (e.deductible.includes('100%')) deductibleTotal += e.amount;
        else if (e.deductible.includes('50%')) deductibleTotal += e.amount * 0.5;
        else if (e.deductible.includes('PARTIAL')) deductibleTotal += e.amount * 0.5;
      }
    });

    document.getElementById('kpi-total').textContent = `$${total.toFixed(2)}`;
    document.getElementById('kpi-work').textContent = `$${workTotal.toFixed(2)}`;
    document.getElementById('kpi-deductible').textContent = `$${deductibleTotal.toFixed(2)}`;
    document.getElementById('kpi-savings').textContent = `$${(deductibleTotal * 0.25).toFixed(2)}`;
  }

  // --- Chart.js Rendering ---
  function renderCharts() {
    const domainCtx = document.getElementById('domainChart');
    const categoryCtx = document.getElementById('categoryChart');
    if (!domainCtx || !categoryCtx) return;

    let workCount = 0;
    let personalCount = 0;
    let categorySums = {};

    expenses.forEach(e => {
      if (e.domain === 'WORK') workCount++;
      else personalCount++;

      categorySums[e.category] = (categorySums[e.category] || 0) + e.amount;
    });

    // Destroy existing charts if re-rendering
    if (domainChartInstance) domainChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();

    // Domain Doughnut Chart
    domainChartInstance = new Chart(domainCtx, {
      type: 'doughnut',
      data: {
        labels: ['WORK Expenses', 'PERSONAL Expenses'],
        datasets: [{
          data: [workCount || 1, personalCount],
          backgroundColor: ['#10b981', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });

    // Category Bar Chart
    categoryChartInstance = new Chart(categoryCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(categorySums).length > 0 ? Object.keys(categorySums) : ['Client Meal', 'Hardware', 'Software'],
        datasets: [{
          label: 'Total Spend ($)',
          data: Object.keys(categorySums).length > 0 ? Object.values(categorySums) : [25, 1200, 150],
          backgroundColor: '#6366f1',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94a3b8' } },
          y: { ticks: { color: '#94a3b8' } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });
  }
});
