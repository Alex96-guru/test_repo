const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelectorAll('.site-nav a');
const yearNode = document.getElementById('year');
const pageName = document.body.dataset.page;
const statsNodes = document.querySelectorAll('[data-stats-count]');
const apiModeNodes = document.querySelectorAll('[data-api-mode]');
const apiStatusNode = document.querySelector('[data-api-status]');
const apiNoteNode = document.querySelector('[data-api-note]');
const leadListNode = document.querySelector('[data-lead-list]');
const leadForm = document.querySelector('[data-lead-form]');
const formStatus = document.querySelector('[data-form-status]');

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if (pageName) {
  const activeLink = document.querySelector(`[data-nav="${pageName}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

if (header && toggle) {
  toggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      header.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) {
      header.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function setApiMode(text) {
  apiModeNodes.forEach((node) => {
    node.textContent = text;
  });
}

function setStatsCount(value) {
  statsNodes.forEach((node) => {
    node.textContent = value;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLeadList(items) {
  if (!leadListNode) {
    return;
  }

  if (!items.length) {
    leadListNode.innerHTML = '<li class="submission-empty">Пока нет заявок.</li>';
    return;
  }

  leadListNode.innerHTML = items
    .map((item) => {
      const createdAt = new Date(item.createdAt).toLocaleString('ru-RU');
      const safeName = escapeHtml(item.name);
      const safeEmail = escapeHtml(item.email);
      const safeProject = escapeHtml(item.projectTypeLabel);
      const safeMessage = escapeHtml(item.message);

      return `
        <li class="submission-item">
          <h3>${safeName} · ${safeProject}</h3>
          <p>${safeMessage}</p>
          <time datetime="${item.createdAt}">${createdAt} · ${safeEmail}</time>
        </li>
      `;
    })
    .join('');
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) {
      throw new Error('API unavailable');
    }

    const data = await response.json();
    setApiMode('Node + SQLite');
    setStatsCount(String(data.totalLeads));

    if (apiStatusNode) {
      apiStatusNode.dataset.apiStatus = 'live';
    }

    if (apiNoteNode) {
      apiNoteNode.textContent = 'Backend доступен. Ниже показаны последние записи из SQLite.';
    }

    renderLeadList(data.recentLeads || []);
  } catch (error) {
    setApiMode('Static only');
    setStatsCount('demo');

    if (apiNoteNode) {
      apiNoteNode.textContent = 'Сейчас открыт статический режим. Для записи в БД запусти сайт через npm start.';
    }

    renderLeadList([]);
  }
}

if (statsNodes.length || leadListNode) {
  loadStats();
}

if (leadForm && formStatus) {
  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(leadForm);
    const payload = Object.fromEntries(formData.entries());

    formStatus.textContent = 'Отправка...';

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось отправить форму');
      }

      formStatus.textContent = 'Заявка сохранена в SQLite.';
      leadForm.reset();
      await loadStats();
    } catch (error) {
      formStatus.textContent = error.message.includes('Failed to fetch')
        ? 'Backend недоступен. Для БД нужен запуск через npm start.'
        : error.message;
    }
  });
}
