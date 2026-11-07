export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed) {
    return "Email address is required.";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function validateName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return "Full name is required.";
  }
  if (trimmed.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (trimmed.length > 100) {
    return "Name cannot exceed 100 characters.";
  }
  return null;
}

export function getPasswordCriteria(password) {
  const str = typeof password === "string" ? password : "";
  return {
    minLength: str.length >= 8 && str.length <= 72,
    hasLetter: /[A-Za-z]/.test(str),
    hasNumber: /\d/.test(str),
  };
}

export function validatePassword(password, fieldLabel = "Password") {
  const str = typeof password === "string" ? password : "";
  if (!str) {
    return `${fieldLabel} is required.`;
  }
  const criteria = getPasswordCriteria(str);
  if (!criteria.minLength || !criteria.hasLetter || !criteria.hasNumber) {
    return `${fieldLabel} must be 8-72 characters and contain at least one letter and one number.`;
  }
  return null;
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  if (!password) {
    errors.password = "Password is required.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateRegisterForm({
  name,
  email,
  password,
  confirmPassword,
}) {
  const errors = {};

  const nameError = validateName(name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateForgotPasswordForm({ email }) {
  const errors = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateResetPasswordForm({ password, confirmPassword }) {
  const errors = {};
  const passwordError = validatePassword(password, "New password");
  if (passwordError) errors.password = passwordError;

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your new password.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
