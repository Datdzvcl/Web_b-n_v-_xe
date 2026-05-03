document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today for search form
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.min = today;
    }

    // Handle Search Form Submission
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const from = document.getElementById('from').value;
            const to = document.getElementById('to').value;
            const date = document.getElementById('date').value;
            
            window.location.href = `search.html?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`;
        });
    }

    // Auth state detection
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    
    if (token && userStr && loginBtn) {
        const user = JSON.parse(userStr);
        loginBtn.innerHTML = `<i class="fa-solid fa-user"></i> ${user.fullName}`;
        if (user.role === 'Admin') {
            loginBtn.href = "admin/index.html";
        } else if (user.role === 'Operator') {
            loginBtn.href = "operator.html";
        } else if (user.role === 'Driver') {
            loginBtn.href = "driver.html";
        } else {
            loginBtn.href = "#";
        }
        if(registerBtn) {
            registerBtn.innerHTML = 'Đăng xuất';
            registerBtn.href = '#';
            registerBtn.classList.replace('btn-primary', 'btn-outline');
            registerBtn.style.color = '#ef4444';
            registerBtn.style.borderColor = '#ef4444';
            
            registerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.reload();
            });
        }
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if(target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
