App.registerView('billing', {
    render() {
        return `
            <div class="page-title">Billing & Payments</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Invoices</h3>
                    <button class="btn btn-primary" onclick="App.showToast('Generate Invoice logic coming soon')">+ Generate Invoice</button>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Brand</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Due Date</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="billing-table-body">
                            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading invoices...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async mount(container) {
        const invoices = await Api.get('/invoices');
        const tbody = document.getElementById('billing-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (invoices && invoices.length > 0) {
            invoices.forEach(i => {
                const tr = document.createElement('tr');
                
                const tdNum = document.createElement('td');
                tdNum.style.fontFamily = 'monospace';
                tdNum.style.fontWeight = '600';
                tdNum.textContent = i.invoice_number;
                tr.appendChild(tdNum);

                const tdBrand = document.createElement('td');
                tdBrand.style.fontWeight = '500';
                tdBrand.textContent = i.brand_name || 'Unknown Brand';
                tr.appendChild(tdBrand);

                const tdAmount = document.createElement('td');
                tdAmount.style.fontWeight = '700';
                tdAmount.textContent = `₹${(i.amount || 0).toLocaleString()}`;
                tr.appendChild(tdAmount);

                const tdStatus = document.createElement('td');
                const badgeClass = i.status === 'Paid' ? 'paid' : (i.status === 'Pending' ? 'pending' : 'active');
                const span = document.createElement('span');
                span.className = `badge ${badgeClass}`;
                span.textContent = i.status;
                tdStatus.appendChild(span);
                tr.appendChild(tdStatus);

                const tdDate = document.createElement('td');
                tdDate.style.color = 'var(--text-muted)';
                tdDate.textContent = i.due_date || '-';
                tr.appendChild(tdDate);

                const tdAction = document.createElement('td');
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary';
                btn.style.padding = '4px 8px';
                btn.style.fontSize = '0.75rem';
                btn.textContent = 'Download';
                tdAction.appendChild(btn);
                tr.appendChild(tdAction);

                tbody.appendChild(tr);
            });
        } else {
            // MVP dummy data if DB empty
            tbody.innerHTML = `
                <tr><td style="font-family: monospace; font-weight: 600;">INV-1021</td><td style="font-weight: 500;">ABC Gym</td><td style="font-weight: 700;">₹25,000</td><td><span class="badge paid">Paid</span></td><td style="color: var(--text-muted);">Feb 05</td><td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download</button></td></tr>
                <tr><td style="font-family: monospace; font-weight: 600;">INV-1022</td><td style="font-weight: 500;">XYZ Hospital</td><td style="font-weight: 700;">₹18,000</td><td><span class="badge pending">Pending</span></td><td style="color: var(--text-muted);">Feb 06</td><td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download</button></td></tr>
            `;
        }
    }
});
