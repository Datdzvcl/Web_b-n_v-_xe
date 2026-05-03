document.addEventListener('DOMContentLoaded', () => {
    // In a real app we fetch order info using bookingId param
    // Simulating a random price for display
    document.getElementById('paymentAmount').textContent = "500.000 đ";

    // Payment Selection Animation
    const methods = document.querySelectorAll('.method-card');
    methods.forEach(card => {
        card.addEventListener('click', () => {
            methods.forEach(m => {
                m.classList.remove('selected');
                const lastIcon = m.querySelector('i:last-child');
                if (lastIcon) {
                    lastIcon.className = 'fa-regular fa-circle';
                    lastIcon.style.color = '#cbd5e1';
                }
            });
            card.classList.add('selected');
            const lastIcon = card.querySelector('i:last-child');
            if(lastIcon) {
                lastIcon.className = 'fa-solid fa-circle-check';
                lastIcon.style.color = 'var(--primary-color)';
            }
        });
    });

    // Simulate Payment Redirect
    document.getElementById('btnPay').addEventListener('click', () => {
        const selectedMethod = document.querySelector('.method-card.selected');
        
        document.getElementById('paymentContent').style.display = 'none';
        document.getElementById('processing').style.display = 'block';
        
        // Simulate network delay to gateway
        setTimeout(() => {
            document.getElementById('processing').style.display = 'none';
            document.getElementById('success').style.display = 'block';
            document.getElementById('purchaseTime').textContent = new Date().toLocaleString('vi-VN');
        }, 2000);
    });
});
