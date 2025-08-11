document.addEventListener('DOMContentLoaded', () => {
    let budgetedAmount = parseFloat(localStorage.getItem('budgetedAmount')) || 0;
    let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
    
    function updateSummary() {
        let totalIncome = budgetedAmount;
        let totalExpenses = 0;
        
        transactions.forEach(t => {
            if (t.type === 'income') {
                totalIncome += parseFloat(t.amount);
            } else if (t.type === 'expense') {
                totalExpenses += parseFloat(t.amount);
            }
        });
        
        document.getElementById('income').textContent = totalIncome.toFixed(2);
        document.getElementById('expenses').textContent = totalExpenses.toFixed(2);
        document.getElementById('net').textContent = (totalIncome - totalExpenses).toFixed(2);
    }
    
    updateSummary();
});