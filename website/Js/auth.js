/* ============================================
   AUTHENTICATION MODULE
   Handles login, signup, logout, session
   checking, toast notifications, sidebar
   toggle, user info display with avatar,
   and notification bell.
   ============================================ */

/* ---------- Toast Notification System ---------- */
function showToast(message, type) {
  type = type || 'success';
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<i class="fas ' + (icons[type] || icons.info) + '"></i>' +
    '<span>' + message + '</span>';
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    toast.classList.add('show');
  });

  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 4000);
}

/* ---------- Check if Supabase client is ready ---------- */
function isSupabaseReady() {
  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    console.error('Supabase is NOT loaded.');
    return false;
  }
  if (
    typeof SUPABASE_URL !== 'undefined' &&
    (SUPABASE_URL === 'https://YOUR_PROJECT_ID.supabase.co' ||
     SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY')
  ) {
    console.warn('Placeholder keys detected.');
    return false;
  }
  return true;
}

/* ---------- Session Check ---------- */
async function checkAuth() {
  try {
    if (!isSupabaseReady()) { window.location.href = 'index.html'; return null; }
    var result = await supabase.auth.getSession();
    if (!result.data.session) { window.location.href = 'index.html'; return null; }
    return result.data.session.user;
  } catch (err) {
    console.error('Auth check error:', err);
    window.location.href = 'index.html';
    return null;
  }
}

/* ---------- Get Current User ---------- */
async function getCurrentUser() {
  if (!isSupabaseReady()) return null;
  try {
    var result = await supabase.auth.getUser();
    return result.data.user;
  } catch (err) {
    console.error('Get user error:', err);
    return null;
  }
}

/* ---------- Login ---------- */
async function login(email, password) {
  if (!isSupabaseReady()) { showToast('Supabase not connected.', 'error'); return false; }
  try {
    var result = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (result.error) { showToast(result.error.message, 'error'); return false; }
    showToast('Login successful!', 'success');
    setTimeout(function() { window.location.href = 'dashboard.html'; }, 600);
    return true;
  } catch (err) {
    showToast('Login failed: ' + err.message, 'error');
    return false;
  }
}

/* ---------- Signup ---------- */
async function signup(email, password, farmName) {
  if (!isSupabaseReady()) { showToast('Supabase not connected.', 'error'); return false; }
  try {
    var result = await supabase.auth.signUp({ email: email, password: password });
    if (result.error) { showToast(result.error.message, 'error'); return false; }
    if (result.data.user) {
      try { await supabase.from('profiles').insert([{ user_id: result.data.user.id, farm_name: farmName || '' }]); } catch (e) { console.warn(e); }
    }
    showToast('Account created! Check your email to verify.', 'success');
    return true;
  } catch (err) {
    showToast('Signup failed: ' + err.message, 'error');
    return false;
  }
}

/* ---------- Logout ---------- */
async function logout() {
  if (!isSupabaseReady()) { showToast('Supabase not connected.', 'error'); return; }
  try {
    var result = await supabase.auth.signOut();
    if (result.error) { showToast('Logout failed.', 'error'); return; }
    showToast('Logged out.', 'info');
    setTimeout(function() { window.location.href = 'index.html'; }, 400);
  } catch (err) {
    showToast('Logout error.', 'error');
  }
}

/* ---------- Load User Info into Topbar (with avatar) ---------- */
async function loadUserInfo() {
  var user = await getCurrentUser();
  if (!user) return;

  var nameEl = document.getElementById('userName');
  var avatarEl = document.getElementById('userAvatar');

  if (nameEl) nameEl.textContent = user.email.split('@')[0];

  try {
    var result = await supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle();
    var avatarUrl = (result.data && result.data.avatar_url) ? result.data.avatar_url : '';
    if (avatarEl) {
      if (avatarUrl) {
        avatarEl.innerHTML = '<img src="' + avatarUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentNode.textContent=\'' + user.email.substring(0, 2).toUpperCase() + '\'">';
      } else {
        avatarEl.textContent = user.email.substring(0, 2).toUpperCase();
      }
    }
  } catch (err) {
    if (avatarEl) avatarEl.textContent = user.email.substring(0, 2).toUpperCase();
  }

  /* Load notifications after user info is set */
  loadNotifications(user.id);
}

/* ---------- Show Page-Level Connection Status ---------- */
function showPageStatus(message, type) {
  var el = document.getElementById('pageStatus');
  if (!el) return;
  var styles = {
    error:   { bg: '#FFEBEE', color: 'var(--red)',    icon: 'fa-circle-xmark' },
    warning: { bg: '#FFF8E1', color: '#E65100',       icon: 'fa-triangle-exclamation' },
    success: { bg: '#E8F5E9', color: 'var(--primary)', icon: 'fa-circle-check' }
  };
  var s = styles[type] || styles.error;
  el.style.display = 'block';
  el.style.background = s.bg;
  el.style.color = s.color;
  el.innerHTML = '<i class="fas ' + s.icon + '"></i> ' + message;
  if (type === 'success') {
    setTimeout(function() { el.style.transition = 'opacity 0.5s'; el.style.opacity = '0'; setTimeout(function() { el.style.display = 'none'; }, 500); }, 3000);
  }
}

/* ---------- Check Auth for Pages with Own Handling ---------- */
async function checkAuthWithStatus() {
  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    showPageStatus('Supabase not loaded. Use a local server, not file://', 'error'); return null;
  }
  if (typeof SUPABASE_URL !== 'undefined' && (SUPABASE_URL === 'https://YOUR_PROJECT_ID.supabase.co' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY')) {
    showPageStatus('Placeholder keys detected. Edit js/supabase.js', 'warning'); return null;
  }
  try {
    var result = await supabase.auth.getSession();
    if (!result.data.session) { showPageStatus('No session. Redirecting...', 'error'); setTimeout(function() { window.location.href = 'index.html'; }, 1500); return null; }
    showPageStatus('Connected', 'success');
    return result.data.session.user;
  } catch (err) {
    showPageStatus('Session check failed.', 'error');
    setTimeout(function() { window.location.href = 'index.html'; }, 1500);
    return null;
  }
}


/* ============================================
   NOTIFICATION BELL SYSTEM
   Fetches real data and shows alerts.
   ============================================ */

/* Store notifications so we can count them */
var notifItems = [];

async function loadNotifications(userId) {
  try {
    var r1 = await supabase.from('tasks').select('title, due_date, priority, status').eq('user_id', userId);
    var r2 = await supabase.from('animals').select('tag_id, health_status').eq('user_id', userId);
    var r3 = await supabase.from('health_records').select('tag_id, disease, next_check_date, status').eq('user_id', userId);
    var r4 = await supabase.from('breeding_records').select('tag_id, expected_birth_date, pregnancy_status').eq('user_id', userId);

    var tasks = r1.data || [];
    var animals = r2.data || [];
    var health = r3.data || [];
    var breeding = r4.data || [];

    notifItems = [];
    var now = new Date();

    /* 1. Overdue tasks */
    tasks.forEach(function(t) {
      if (t.due_date && t.status !== 'Completed' && new Date(t.due_date) < now) {
        notifItems.push({
          icon: 'fa-clock', color: 'red',
          title: 'Overdue: ' + t.title,
          sub: 'Was due ' + new Date(t.due_date).toLocaleDateString(),
          link: 'tasks.html'
        });
      }
    });

    /* 2. Critical animals */
    animals.forEach(function(a) {
      if (a.health_status === 'Critical') {
        notifItems.push({
          icon: 'fa-triangle-exclamation', color: 'red',
          title: 'Critical: ' + a.tag_id,
          sub: 'Animal needs immediate attention',
          link: 'health.html'
        });
      }
    });

    /* 3. Under treatment animals */
    animals.forEach(function(a) {
      if (a.health_status === 'Under Treatment') {
        notifItems.push({
          icon: 'fa-stethoscope', color: 'orange',
          title: 'Treatment: ' + a.tag_id,
          sub: 'Currently under treatment',
          link: 'health.html'
        });
      }
    });

    /* 4. Upcoming health check-due */
    health.forEach(function(h) {
      if (h.next_check_date) {
        var daysUntil = Math.ceil((new Date(h.next_check_date) - now) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 3 && daysUntil >= 0 && h.status !== 'Recovered') {
          notifItems.push({
            icon: 'fa-calendar-check', color: 'blue',
            title: 'Check-up due: ' + (h.tag_id || '—'),
            sub: daysUntil === 0 ? 'Today!' : 'In ' + daysUntil + ' day' + (daysUntil > 1 ? 's' : '') + ' — ' + (h.disease || ''),
            link: 'health.html'
          });
        }
        if (daysUntil < 0 && h.status !== 'Recovered') {
          notifItems.push({
            icon: 'fa-calendar-xmark', color: 'red',
            title: 'Missed check-up: ' + (h.tag_id || '—'),
            sub: 'Was due ' + Math.abs(daysUntil) + ' day' + (Math.abs(daysUntil) > 1 ? 's' : '') + ' ago',
            link: 'health.html'
          });
        }
      }
    });

    /* 5. Expected births (within 7 days) */
    breeding.forEach(function(b) {
      if (b.expected_birth_date && b.pregnancy_status === 'Pregnant') {
        var daysUntil = Math.ceil((new Date(b.expected_birth_date) - now) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 7 && daysUntil >= 0) {
          notifItems.push({
            icon: 'fa-baby', color: 'purple',
            title: 'Expected birth: ' + (b.tag_id || '—'),
            sub: daysUntil === 0 ? 'Today!' : 'In ' + daysUntil + ' day' + (daysUntil > 1 ? 's' : ''),
            link: 'breeding.html'
          });
        }
      }
    });

  } catch (err) {
    console.warn('Notifications load error:', err);
  }

  renderNotifications();
}

/* ---------- Render the notification dropdown ---------- */
function renderNotifications() {
  var list = document.getElementById('notifList');
  var count = document.getElementById('notifCount');
  var dot = document.querySelector('.badge-dot');

  if (!list) return;

  /* Update count badge */
  var total = notifItems.length;
  if (count) {
    count.textContent = total;
    count.style.display = total > 0 ? 'inline-flex' : 'none';
  }
  if (dot) {
    dot.style.display = total > 0 ? 'block' : 'none';
  }

  /* Render items */
  if (total === 0) {
    list.innerHTML =
      '<div class="notif-empty">' +
        '<i class="fas fa-bell-slash"></i>' +
        '<p>No notifications</p>' +
      '</div>';
    return;
  }

  /* Sort: red first, then orange, then others */
  var order = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };
  notifItems.sort(function(a, b) {
    return (order[a.color] || 5) - (order[b.color] || 5);
  });

  list.innerHTML = notifItems.map(function(n) {
    return '<a href="' + n.link + '" class="notif-item">' +
      '<div class="notif-icon ' + n.color + '"><i class="fas ' + n.icon + '"></i></div>' +
      '<div class="notif-text">' +
        '<p>' + esc(n.title) + '</p>' +
        '<span>' + esc(n.sub) + '</span>' +
      '</div>' +
    '</a>';
  }).join('');
}

/* ---------- Esc helper for notifications ---------- */
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}


/* ============================================
   DOM READY
   ============================================ */
document.addEventListener('DOMContentLoaded', function() {

  var isAuthPage = document.getElementById('authPage');
  var hasOwnAuth = document.getElementById('pageStatus');

  if (!isAuthPage && !hasOwnAuth) {
    checkAuth().then(function(user) {
      if (user) loadUserInfo();
    });
  }

  if (!isAuthPage && hasOwnAuth) {
    (async function() {
      try {
        if (typeof supabase !== 'undefined' && supabase && supabase.auth) {
          var result = await supabase.auth.getSession();
          if (result.data.session) loadUserInfo();
        }
      } catch (err) { console.warn('Could not preload topbar:', err); }
    })();
  }

  /* ---------- Logout via delegation ---------- */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('#logoutBtn');
    if (btn) { e.preventDefault(); e.stopPropagation(); logout(); }
  });

  /* ---------- Notification bell toggle ---------- */
  var bellBtn = document.getElementById('bellBtn');
  var notifDrop = document.getElementById('notifDropdown');

  if (bellBtn && notifDrop) {
    bellBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      notifDrop.classList.toggle('show');
    });

    /* Close when clicking outside */
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.notif-wrapper')) {
        notifDrop.classList.remove('show');
      }
    });
  }

  /* ---------- Mark all read (just hides count) ---------- */
  var markReadBtn = document.getElementById('markReadBtn');
  if (markReadBtn) {
    markReadBtn.addEventListener('click', function(e) {
      e.preventDefault();
      notifItems = [];
      renderNotifications();
      showToast('Notifications cleared.', 'info');
    });
  }

  /* ---------- Sidebar toggle ---------- */
  var menuToggle = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var sidebarClose = document.getElementById('sidebarClose');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.add('open');
      if (sidebarOverlay) sidebarOverlay.classList.add('show');
    });
  }
  if (sidebarClose && sidebar) {
    sidebarClose.addEventListener('click', function() {
      sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    });
  }
  if (sidebarOverlay && sidebar) {
    sidebarOverlay.addEventListener('click', function() {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    });
  }
});