const form = document.querySelector('#auth-page-form');
const loginTab = document.querySelector('#login-tab');
const signupTab = document.querySelector('#signup-tab');
const authTabs = document.querySelector('#auth-tabs');
const nameField = document.querySelector('#auth-name-field');
const emailField = document.querySelector('#auth-email-field');
const passwordFieldWrapper = document.querySelector('#auth-password-field');
const title = document.querySelector('#auth-page-title');
const subtitle = document.querySelector('#auth-page-subtitle');
const submit = document.querySelector('.auth-page-submit');
const message = document.querySelector('.auth-page-message');
const passwordField = document.querySelector('input[name="password"]');
const nameInput = nameField.querySelector('input');
const emailInput = emailField.querySelector('input');
const verificationField = document.querySelector('#verification-field');
const resendCode = document.querySelector('#resend-code');
let verificationPending = false;
let verificationEmail = '';

let mode = new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login';

const setMode = (nextMode) => {
  mode = nextMode;
  verificationPending = false;
  const signup = mode === 'signup';
  title.innerHTML = signup ? 'Create <em>account.</em>' : 'Welcome <em>back.</em>';
  subtitle.textContent = signup ? 'Create a local account to continue.' : 'Log in to continue to your local account.';
  nameField.hidden = !signup;
  emailField.hidden = false;
  passwordFieldWrapper.hidden = false;
  nameField.querySelector('input').required = signup;
  verificationField.hidden = true;
  resendCode.hidden = true;
  verificationField.querySelector('input').required = false;
  passwordField.required = true;
  authTabs.hidden = false;
  submit.innerHTML = signup ? 'Create account <span>↗</span>' : 'Log in <span>↗</span>';
  loginTab.setAttribute('aria-selected', String(!signup));
  signupTab.setAttribute('aria-selected', String(signup));
  message.textContent = '';
  message.classList.remove('error');
};

loginTab.addEventListener('click', () => setMode('login'));
signupTab.addEventListener('click', () => setMode('signup'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = (verificationPending ? verificationEmail : data.get('email')).trim().toLowerCase();
  message.classList.remove('error');
  if (verificationPending && !/^\d{6}$/.test(String(data.get('code') || '').trim())) {
    message.textContent = 'Enter the 6-digit verification code from your email.';
    message.classList.add('error');
    return;
  }
  if (!verificationPending && (!/^\S+@\S+\.\S+$/.test(email) || String(data.get('password') || '').length < 6 || (mode === 'signup' && !String(data.get('name') || '').trim()))) {
    message.textContent = mode === 'signup' ? 'Enter your name, a valid email, and a password of at least 6 characters.' : 'Enter a valid email and a password of at least 6 characters.';
    message.classList.add('error');
    return;
  }
  submit.disabled = true;
  submit.style.opacity = '0.65';
  try {
    const endpoint = verificationPending ? '/api/auth/verify' : `/api/auth/${mode}`;
    const payload = verificationPending ? { email, code: data.get('code') } : { name: data.get('name'), email, password: data.get('password') };
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Authentication failed.');
    if (verificationPending) {
      message.textContent = 'Email verified. Redirecting to your profile...';
      window.setTimeout(() => { window.location.href = 'index.html'; }, 700);
      return;
    }
    if (mode === 'signup' && result.requiresVerification) {
      verificationPending = true;
      verificationEmail = result.email;
      verificationField.hidden = false;
      verificationField.querySelector('input').required = true;
      emailField.hidden = true;
      passwordFieldWrapper.hidden = true;
      passwordField.required = false;
      nameInput.required = false;
      emailInput.required = false;
      nameField.hidden = true;
      authTabs.hidden = true;
      resendCode.hidden = false;
      subtitle.textContent = `Enter the verification code sent to ${result.email}.`;
      submit.innerHTML = 'Verify email <span>↗</span>';
      message.textContent = `We sent a verification code to ${result.email}.`;
      form.reset();
      return;
    }
    if (mode === 'signup') throw new Error('Signup did not start email verification. Check the Node.js server and Gmail settings.');
    if (!result.user) throw new Error('Login response is invalid.');
    message.textContent = `Welcome back, ${result.user.name || 'there'}!`;
    window.setTimeout(() => { window.location.href = 'index.html'; }, 900);
  } catch (error) {
    message.textContent = error.message.includes('Failed to fetch') ? 'Start the Node.js server, then try again.' : error.message;
    message.classList.add('error');
  } finally {
    submit.disabled = false;
    submit.style.opacity = '';
  }
});

resendCode.addEventListener('click', async () => {
  const email = (verificationPending ? verificationEmail : emailInput.value).trim().toLowerCase();
  const response = await fetch('/api/auth/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const result = await response.json();
  message.textContent = response.ok ? `A new code was sent to ${result.email}.` : result.error;
  message.classList.toggle('error', !response.ok);
});

const authTranslations = {
  en: { '.auth-back': 'Back to studio ↗', '#login-tab': 'Log in', '#signup-tab': 'Sign up', '#auth-name-field': 'Full name', '#auth-email-field': 'Email', '#auth-password-field': 'Password', '#verification-field': 'Verification code', '#resend-code': 'Resend verification code' },
  fr: { '.auth-back': 'Retour au studio ↗', '#login-tab': 'Connexion', '#signup-tab': 'Créer un compte', '#auth-name-field': 'Nom complet', '#auth-email-field': 'E-mail', '#auth-password-field': 'Mot de passe', '#verification-field': 'Code de vérification', '#resend-code': 'Renvoyer le code' },
  ar: { '.auth-back': 'العودة إلى الاستوديو ↗', '#login-tab': 'تسجيل الدخول', '#signup-tab': 'إنشاء حساب', '#auth-name-field': 'الاسم الكامل', '#auth-email-field': 'البريد الإلكتروني', '#auth-password-field': 'كلمة السر', '#verification-field': 'رمز التحقق', '#resend-code': 'إعادة إرسال الرمز' }
};

const applyAuthLanguage = (language) => {
  const selected = authTranslations[language] ? language : 'en';
  document.documentElement.lang = selected;
  document.documentElement.dir = selected === 'ar' ? 'rtl' : 'ltr';
  Object.entries(authTranslations[selected]).forEach(([selector, content]) => document.querySelectorAll(selector).forEach((element) => {
    if (element.tagName === 'LABEL') {
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.nodeValue = content;
    } else {
      element.textContent = content;
    }
  }));
  const copy = {
    en: { loginTitle: 'Welcome <em>back.</em>', signupTitle: 'Create <em>account.</em>', loginSubtitle: 'Log in to continue to your local account.', signupSubtitle: 'Create a local account to continue.', loginButton: 'Log in ↗', signupButton: 'Create account ↗' },
    fr: { loginTitle: 'Bon <em>retour.</em>', signupTitle: 'Créer un <em>compte.</em>', loginSubtitle: 'Connectez-vous pour continuer.', signupSubtitle: 'Créez un compte pour continuer.', loginButton: 'Se connecter ↗', signupButton: 'Créer le compte ↗' },
    ar: { loginTitle: 'مرحباً <em>بعودتك.</em>', signupTitle: 'أنشئ <em>حساباً.</em>', loginSubtitle: 'سجّل الدخول للمتابعة إلى حسابك.', signupSubtitle: 'أنشئ حساباً للمتابعة.', loginButton: 'تسجيل الدخول ↗', signupButton: 'إنشاء الحساب ↗' }
  }[selected];
  title.innerHTML = mode === 'signup' ? copy.signupTitle : copy.loginTitle;
  subtitle.textContent = mode === 'signup' ? copy.signupSubtitle : copy.loginSubtitle;
  submit.innerHTML = mode === 'signup' ? copy.signupButton : copy.loginButton;
};

setMode(mode);
applyAuthLanguage(localStorage.getItem('soufiane-language') || 'en');
