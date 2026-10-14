const crypto = require('crypto');

const generateRandomString = (length) => {
  let result = '';
  const characters = '0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;// return les 6 chiffres du code aléatoire
};

const generateOtpCode = () => crypto.randomInt(100000, 999999).toString();

// Mot de passe d'agent station, dicté au téléphone : lettres et chiffres
// sans les caractères ambigus (0/O, 1/l/I), au moins une lettre et un chiffre.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

const generatePassword = (length = 8) => {
  let password = '';
  while (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    password = Array.from({ length }, () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]).join('');
  }
  return password;
};

// Mirrors the client's normalizeGuineaPhone: strips everything but digits,
// drops a leading 224/00224 country code, and only accepts a 9-digit number
// starting with 6 or 7. Returns null instead of throwing so callers can turn
// it into a plain 400 response.
const normalizeGuineaPhone = (raw) => {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, '');

  if (digits.startsWith('00224')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('224')) {
    digits = digits.slice(3);
  }

  if (!/^[67]\d{8}$/.test(digits)) {
    return null;
  }

  return `+224${digits}`;
};

module.exports = {
  generateRandomString,
  generateOtpCode,
  generatePassword,
  normalizeGuineaPhone,
};
