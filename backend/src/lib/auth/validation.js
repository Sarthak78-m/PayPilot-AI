const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateRegistrationInput(input) {
  const name = asTrimmedString(input?.name);
  const email = asTrimmedString(input?.email).toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const errors = {};

  if (name.length < 2 || name.length > 100) {
    errors.name = "Name must be between 2 and 100 characters.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (
    password.length < 8 ||
    password.length > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    errors.password =
      "Password must be 8-72 characters and include a letter and a number.";
  }

  return Object.keys(errors).length > 0
    ? { valid: false, errors }
    : { valid: true, data: { name, email, password } };
}

export function validateLoginInput(input) {
  const email = asTrimmedString(input?.email).toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const errors = {};

  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  return Object.keys(errors).length > 0
    ? { valid: false, errors }
    : { valid: true, data: { email, password } };
}
