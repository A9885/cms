App.registerView('billing', {
    render() {
        return `
            <div class="page-title">Billing & Payments</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Invoices</h3>
                    <button class="btn btn-primary" onclick="alert('Generate Invoice logic coming soon')">+ Generate Invoice</button>
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
        let html = '';
        if (invoices && invoices.length > 0) {
            invoices.forEach(i => {
                const badgeClass = i.status === 'Paid' ? 'paid' : (i.status === 'Pending' ? 'pending' : 'active');
                html += `
                    <tr>
                        <td style="font-family: monospace; font-weight: 600;">${i.invoice_number}</td>
                        <td style="font-weight: 500;">${i.brand_name || 'Unknown Brand'}</td>
                        <td style="font-weight: 700;">₹${i.amount.toLocaleString()}</td>
                        <td><span class="badge ${badgeClass}">${i.status}</span></td>
                        <td style="color: var(--text-muted);">${i.due_date || '-'}</td>
                        <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download</button></td>
                    </tr>
                `;
            });
        } else {
            // MVP dummy data if DB empty
            html = `
                <tr><td style="font-family: monospace; font-weight: 600;">INV-1021</td><td style="font-weight: 500;">ABC Gym</td><td style="font-weight: 700;">₹25,000</td><td><span class="badge paid">Paid</span></td><td style="color: var(--text-muted);">Feb 05</td><td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download</button></td></tr>
                <tr><td style="font-family: monospace; font-weight: 600;">INV-1022</td><td style="font-weight: 500;">XYZ Hospital</td><td style="font-weight: 700;">₹18,000</td><td><span class="badge pending">Pending</span></td><td style="color: var(--text-muted);">Feb 06</td><td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download</button></td></tr>
            `;
        }
        document.getElementById('billing-table-body').innerHTML = html;
    }
});
