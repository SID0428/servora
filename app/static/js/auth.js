// Servora Authentication Handler

async function quickLogin(role) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: role, role: role })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Logged in as ${data.user.name} (${data.user.role})`, 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } else {
      showToast(data.detail || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Network error during login', 'error');
  }
}

async function handleFormLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('identifier').value.trim();
  const password = document.getElementById('password').value;
  const submitBtn = document.getElementById('submitBtn');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Signing in...</span>
  `;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Welcome back, ${data.user.name}!`, 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } else {
      showToast(data.detail || 'Invalid credentials', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Sign In to Servora</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  } catch (err) {
    showToast('Failed to connect to authentication service', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Sign In to Servora</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
    lucide.createIcons();
  }
}
