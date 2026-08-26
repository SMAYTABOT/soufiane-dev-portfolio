const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
const siteHeader = document.querySelector('.site-header');

const closeMenu = () => {
  mainNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  menuToggle.textContent = '☰';
};

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  menuToggle.textContent = isOpen ? '×' : '☰';
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    closeMenu();
  });
});

document.addEventListener('click', (event) => {
  if (mainNav.classList.contains('open') && !mainNav.contains(event.target) && !menuToggle.contains(event.target)) {
    closeMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMenu();
  }
});

window.addEventListener('scroll', () => {
  siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);
}, { passive: true });

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const sectionLinks = [...document.querySelectorAll('.main-nav a')];
const sectionLinksOnly = sectionLinks.filter((link) => link.getAttribute('href')?.startsWith('#'));
const trackedSections = sectionLinksOnly
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      sectionLinksOnly.forEach((link) => {
        link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    }
  });
}, { rootMargin: '-35% 0px -55% 0px' });

trackedSections.forEach((section) => sectionObserver.observe(section));

const heroVisual = document.querySelector('.hero-visual');
const mainVisualCard = document.querySelector('.interface-window');
const floatingVisualCard = document.querySelector('.card-float');
const scrollProgress = document.querySelector('.scroll-progress');
const customCursor = document.querySelector('.custom-cursor');
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (heroVisual && mainVisualCard && floatingVisualCard && canHover && !reducedMotion) {
  heroVisual.addEventListener('pointermove', (event) => {
    const bounds = heroVisual.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    mainVisualCard.style.transform = `rotate(3deg) translate(${x * 10}px, ${y * 10}px)`;
    floatingVisualCard.style.transform = `rotate(-8deg) translate(${x * -14}px, ${y * -14}px)`;
  });

  heroVisual.addEventListener('pointerleave', () => {
    mainVisualCard.style.transform = '';
    floatingVisualCard.style.transform = '';
  });
}

const updateScrollProgress = () => {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
  scrollProgress.style.width = `${progress * 100}%`;
};

window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

if (customCursor && canHover && !reducedMotion) {
  document.addEventListener('pointermove', (event) => {
    customCursor.classList.add('is-visible');
    customCursor.style.left = `${event.clientX}px`;
    customCursor.style.top = `${event.clientY}px`;
  });

  document.querySelectorAll('a, button').forEach((element) => {
    element.addEventListener('pointerenter', () => customCursor.classList.add('is-hovering'));
    element.addEventListener('pointerleave', () => customCursor.classList.remove('is-hovering'));
  });

  document.querySelectorAll('.project-image').forEach((project) => {
    project.addEventListener('pointerenter', () => customCursor.classList.add('is-project'));
    project.addEventListener('pointerleave', () => customCursor.classList.remove('is-project'));
  });
}

const profileMenu = document.querySelector('#profile-menu');
const profileName = document.querySelector('#profile-name');
const profileAvatar = document.querySelector('#profile-avatar');
const profileTrigger = document.querySelector('#profile-trigger');
const profileDropdown = document.querySelector('#profile-dropdown');
const profileSettings = document.querySelector('#profile-settings');
const profileLogout = document.querySelector('#profile-logout');
const settingsModal = document.querySelector('#settings-modal');
const settingsName = document.querySelector('#settings-name');
const settingsEmail = document.querySelector('#settings-email');
const authLinks = document.querySelectorAll('.auth-link');
const passwordForm = document.querySelector('#password-form');
const passwordMessage = document.querySelector('#password-message');
const changePasswordToggle = document.querySelector('#change-password-toggle');
const profileForm = document.querySelector('#profile-form');
const profileNameInput = document.querySelector('#profile-name-input');
const profileMessage = document.querySelector('#profile-message');
const languageSelect = document.querySelector('#language-select');
const sessionsMessage = document.querySelector('#sessions-message');
const sessionsList = document.querySelector('#sessions-list');
const deleteAccountForm = document.querySelector('#delete-account-form');
const deleteMessage = document.querySelector('#delete-message');
let profileAvatarData = '';

const avatarInput = document.createElement('input');
avatarInput.type = 'file';
avatarInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
avatarInput.id = 'profile-avatar-input';
avatarInput.name = 'avatar';
const avatarLabel = document.createElement('label');
avatarLabel.className = 'avatar-upload';
avatarLabel.textContent = 'Profile image';
avatarLabel.appendChild(avatarInput);
profileNameInput?.closest('label')?.after(avatarLabel);

const renderAvatar = (avatar, fallback) => {
  profileAvatarData = avatar || '';
  if (profileAvatar) {
    profileAvatar.textContent = avatar ? '' : fallback.slice(0, 2).toUpperCase();
    profileAvatar.style.backgroundImage = avatar ? `url(${avatar})` : '';
    profileAvatar.classList.toggle('has-image', Boolean(avatar));
  }
};

avatarInput.addEventListener('change', () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    avatarInput.value = '';
    showSettingsMessage(profileMessage, 'Choose an image smaller than 2 MB.', true);
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    profileAvatarData = String(reader.result);
    avatarPreview.style.backgroundImage = `url(${profileAvatarData})`;
    avatarPreview.classList.add('has-image');
  });
  reader.readAsDataURL(file);
});

const avatarPreview = document.createElement('span');
avatarPreview.className = 'avatar-preview';
avatarPreview.textContent = 'SD';
avatarLabel.prepend(avatarPreview);

const showLoggedOutState = () => {
  profileMenu.hidden = true;
  authLinks.forEach((link) => { link.hidden = false; });
  closeProfileDropdown();
};

const closeProfileDropdown = () => {
  profileDropdown.hidden = true;
  profileTrigger.setAttribute('aria-expanded', 'false');
};

const closeSettingsSections = () => {
  document.querySelectorAll('.settings-option[aria-expanded="true"]').forEach((toggle) => {
    const content = document.getElementById(toggle.getAttribute('aria-controls'));
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelector('.settings-option-icon').textContent = '+';
    if (content) content.hidden = true;
  });
};

document.querySelectorAll('.settings-option').forEach((toggle) => {
  toggle.addEventListener('click', async () => {
    const content = document.getElementById(toggle.getAttribute('aria-controls'));
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.querySelector('.settings-option-icon').textContent = isOpen ? '+' : '−';
    if (content) content.hidden = isOpen;
    if (!isOpen && content?.id === 'sessions-settings') loadSessions();
  });
});

const loadProfile = async () => {
  if (!profileMenu) return;
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) {
      showLoggedOutState();
      return;
    }
    const { user } = await response.json();
    profileName.textContent = user.name || user.email;
    renderAvatar(user.avatar, user.name || user.email);
    settingsName.textContent = user.name || 'Not provided';
    settingsEmail.textContent = user.email;
    profileNameInput.value = user.name || '';
    avatarPreview.textContent = user.avatar ? '' : (user.name || user.email).slice(0, 2).toUpperCase();
    avatarPreview.style.backgroundImage = user.avatar ? `url(${user.avatar})` : '';
    avatarPreview.classList.toggle('has-image', Boolean(user.avatar));
    profileMenu.hidden = false;
    authLinks.forEach((link) => { link.hidden = true; });
  } catch (error) {
    showLoggedOutState();
  }
};

profileTrigger?.addEventListener('click', () => {
  const isOpen = !profileDropdown.hidden;
  profileDropdown.hidden = isOpen;
  profileTrigger.setAttribute('aria-expanded', String(!isOpen));
});

profileSettings?.addEventListener('click', () => {
  closeProfileDropdown();
  settingsModal.hidden = false;
});

document.querySelectorAll('[data-settings-close]').forEach((element) => element.addEventListener('click', () => {
  settingsModal.hidden = true;
  passwordForm?.reset();
  if (passwordMessage) passwordMessage.textContent = '';
  profileForm?.reset();
  closeSettingsSections();
}));

passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  passwordMessage.classList.remove('error');
  if (newPassword !== confirmPassword) {
    passwordMessage.textContent = 'New passwords do not match.';
    passwordMessage.classList.add('error');
    return;
  }
  const submitButton = passwordForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword, newPassword }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update your password.');
    passwordMessage.textContent = 'Password updated successfully.';
    passwordForm.reset();
  } catch (error) {
    passwordMessage.textContent = error.message.includes('Failed to fetch') ? 'The server is unavailable.' : error.message;
    passwordMessage.classList.add('error');
  } finally {
    submitButton.disabled = false;
  }
});

const showSettingsMessage = (element, text, error = false) => {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('error', error);
};

profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = String(new FormData(profileForm).get('name') || '').trim();
  try {
    const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name, avatar: profileAvatarData }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update your profile.');
    settingsName.textContent = result.user.name;
    profileName.textContent = result.user.name;
    renderAvatar(result.user.avatar, result.user.name);
    showSettingsMessage(profileMessage, 'Profile updated.');
  } catch (error) {
    showSettingsMessage(profileMessage, error.message.includes('Failed to fetch') ? 'The server is unavailable.' : error.message, true);
  }
});

const applyTheme = (theme) => {
  document.body.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('soufiane-theme', theme);
  document.querySelectorAll('[data-theme]').forEach((button) => button.classList.toggle('is-selected', button.dataset.theme === theme));
};

document.querySelectorAll('[data-theme]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.theme)));
applyTheme(localStorage.getItem('soufiane-theme') || 'dark');

const translations = {
  en: {
    '.main-nav a:nth-child(1)': 'Services', '.main-nav a:nth-child(2)': 'Work', '.main-nav a:nth-child(3)': 'Process', '.header-cta': 'Start a project ↗',
    '.hero h1': 'I build digital<br>experiences<br><em>that stand out.</em>', '.hero-services': 'Websites · Mobile apps · Digital products · Creative development', '.hero-text': 'I design and build fast, modern digital experiences for ambitious ideas.', '.hero-actions .button-primary': "Let's build something ↗", '.hero-actions .button-secondary': 'View my work ↓',
    '.services .section-heading h2': 'Digital work with<br><em>real character.</em>', '.work .section-heading h2': 'Selected <em>work.</em>', '.process .section-heading h2': 'A clear path from<br><em>rough idea to real thing.</em>', '.about h2': 'I turn ideas into digital experiences people <em>remember.</em>', '.trust .section-heading h2': 'Built with<br><em>intention.</em>', '.contact h2': "Let's build something<br><em>people remember.</em>",
    '.settings-option[aria-controls="profile-form"] span:first-child': 'Edit profile', '.settings-option[aria-controls="language-settings"] span:first-child': 'Language', '.settings-option[aria-controls="theme-settings"] span:first-child': 'Theme', '.settings-option[aria-controls="sessions-settings"] span:first-child': 'Active sessions', '.settings-option[aria-controls="delete-settings"] span:first-child': 'Delete account', '#change-password-toggle span:first-child': 'Change password',
    '.settings-content[aria-labelledby]': 'Interface language', '.settings-subtitle': 'Change password', '.password-form label:nth-of-type(1)': 'Current password', '.password-form label:nth-of-type(2)': 'New password', '.password-form label:nth-of-type(3)': 'Confirm new password', '#profile-form label': 'Username', '#profile-form button': 'Save profile ↗', '.password-form button': 'Update password ↗', '#delete-account-form label': 'Type DELETE to confirm', '.danger-button': 'Delete account ×'
  },
  fr: {
    '.main-nav a:nth-child(1)': 'Services', '.main-nav a:nth-child(2)': 'Projets', '.main-nav a:nth-child(3)': 'Processus', '.header-cta': 'Démarrer un projet ↗',
    '.hero h1': 'Je crée des<br>expériences<br><em>qui se démarquent.</em>', '.hero-services': 'Sites web · Applications mobiles · Produits numériques · Création digitale', '.hero-text': 'Je conçois et développe des expériences digitales rapides et modernes pour les idées ambitieuses.', '.hero-actions .button-primary': 'Construisons ensemble ↗', '.hero-actions .button-secondary': 'Voir mes projets ↓',
    '.services .section-heading h2': 'Un travail digital avec<br><em>du vrai caractère.</em>', '.work .section-heading h2': 'Projets <em>sélectionnés.</em>', '.process .section-heading h2': 'Un chemin clair de<br><em>l’idée au projet.</em>', '.about h2': 'Je transforme les idées en expériences digitales dont les gens <em>se souviennent.</em>', '.trust .section-heading h2': 'Conçu avec<br><em>intention.</em>', '.contact h2': 'Construisons quelque chose<br><em>dont on se souvient.</em>',
    '.settings-option[aria-controls="profile-form"] span:first-child': 'Modifier le profil', '.settings-option[aria-controls="language-settings"] span:first-child': 'Langue', '.settings-option[aria-controls="theme-settings"] span:first-child': 'Thème', '.settings-option[aria-controls="sessions-settings"] span:first-child': 'Sessions actives', '.settings-option[aria-controls="delete-settings"] span:first-child': 'Supprimer le compte', '#change-password-toggle span:first-child': 'Changer le mot de passe',
    '.settings-select-label': 'Langue de l’interface', '.settings-subtitle': 'Changer le mot de passe', '.password-form label:nth-of-type(1)': 'Mot de passe actuel', '.password-form label:nth-of-type(2)': 'Nouveau mot de passe', '.password-form label:nth-of-type(3)': 'Confirmer le nouveau mot de passe', '#profile-form label': 'Nom d’utilisateur', '#profile-form button': 'Enregistrer le profil ↗', '.password-form button': 'Modifier le mot de passe ↗', '#delete-account-form label': 'Écrivez DELETE pour confirmer', '.danger-button': 'Supprimer le compte ×'
  },
  ar: {
    '.main-nav a:nth-child(1)': 'الخدمات', '.main-nav a:nth-child(2)': 'الأعمال', '.main-nav a:nth-child(3)': 'الطريقة', '.header-cta': 'ابدأ مشروعاً ↗',
    '.hero h1': 'أبني تجارب<br>رقمية<br><em>تترك أثراً.</em>', '.hero-services': 'مواقع · تطبيقات · منتجات رقمية · تطوير إبداعي', '.hero-text': 'أصمم وأطور تجارب رقمية سريعة وعصرية للأفكار الطموحة.', '.hero-actions .button-primary': 'لنَبْنِ شيئاً معاً ↗', '.hero-actions .button-secondary': 'شاهد أعمالي ↓',
    '.services .section-heading h2': 'عمل رقمي<br><em>بشخصية حقيقية.</em>', '.work .section-heading h2': 'أعمال <em>مختارة.</em>', '.process .section-heading h2': 'طريق واضح من<br><em>الفكرة إلى الواقع.</em>', '.about h2': 'أحوّل الأفكار إلى تجارب رقمية يتذكرها الناس <em>طويلاً.</em>', '.trust .section-heading h2': 'نبني<br><em>بنية واضحة.</em>', '.contact h2': 'لنبنِ شيئاً<br><em>يتذكره الناس.</em>',
    '.settings-option[aria-controls="profile-form"] span:first-child': 'تعديل الملف الشخصي', '.settings-option[aria-controls="language-settings"] span:first-child': 'اللغة', '.settings-option[aria-controls="theme-settings"] span:first-child': 'المظهر', '.settings-option[aria-controls="sessions-settings"] span:first-child': 'الجلسات النشطة', '.settings-option[aria-controls="delete-settings"] span:first-child': 'حذف الحساب', '#change-password-toggle span:first-child': 'تغيير كلمة السر',
    '.settings-select-label': 'لغة الواجهة', '.settings-subtitle': 'تغيير كلمة السر', '.password-form label:nth-of-type(1)': 'كلمة السر الحالية', '.password-form label:nth-of-type(2)': 'كلمة السر الجديدة', '.password-form label:nth-of-type(3)': 'تأكيد كلمة السر الجديدة', '#profile-form label': 'اسم المستخدم', '#profile-form button': 'حفظ الملف ↗', '.password-form button': 'تحديث كلمة السر ↗', '#delete-account-form label': 'اكتب DELETE للتأكيد', '.danger-button': 'حذف الحساب ×'
  }
};

const applyLanguage = (language) => {
  const selected = translations[language] ? language : 'en';
  document.documentElement.lang = selected;
  document.documentElement.dir = selected === 'ar' ? 'rtl' : 'ltr';
  Object.entries(translations[selected]).forEach(([selector, content]) => document.querySelectorAll(selector).forEach((element) => {
    if (element.tagName === 'LABEL') {
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.nodeValue = content;
    } else {
      element.innerHTML = content;
    }
  }));
  localStorage.setItem('soufiane-language', selected);
  if (languageSelect) languageSelect.value = selected;
};

languageSelect?.addEventListener('change', () => applyLanguage(languageSelect.value));
applyLanguage(localStorage.getItem('soufiane-language') || 'en');

const loadSessions = async () => {
  try {
    const response = await fetch('/api/auth/sessions', { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load sessions.');
    sessionsList.innerHTML = result.sessions.map((session) => `<div class="session-item"><strong>${session.current ? 'Current session' : 'Active session'}</strong><span>${new Date(session.createdAt).toLocaleString()}</span></div>`).join('');
    showSettingsMessage(sessionsMessage, `${result.sessions.length} active session${result.sessions.length === 1 ? '' : 's'}.`);
  } catch (error) {
    showSettingsMessage(sessionsMessage, error.message, true);
  }
};

deleteAccountForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const confirmation = String(new FormData(deleteAccountForm).get('confirmation') || '');
  if (confirmation.trim().toUpperCase() !== 'DELETE') return showSettingsMessage(deleteMessage, 'Type DELETE to confirm.', true);
  try {
    const response = await fetch('/api/auth/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ confirmation }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not delete your account.');
    window.location.href = 'auth.html?mode=login';
  } catch (error) {
    showSettingsMessage(deleteMessage, error.message, true);
  }
});

document.addEventListener('click', (event) => {
  if (profileMenu && !profileMenu.contains(event.target)) closeProfileDropdown();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeProfileDropdown();
    if (settingsModal) settingsModal.hidden = true;
  }
});

profileLogout?.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error('Logout failed');
  } catch (error) {
    console.error('Logout failed', error);
  } finally {
    showLoggedOutState();
  }
});

loadProfile();

