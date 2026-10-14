const fetch = require('node-fetch');

// Envoi générique d'un SMS via NimbaSMS
const sendSMS = async ({ to, message }) => {
  try {
    const headers = {
      Authorization: `Basic ${process.env.SMS_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const raw = JSON.stringify({
      sender_name: 'KEDI TECH',
      to: [to],
      message,
    });

    const response = await fetch(`${process.env.SMS_API_URL}/messages`, {
      method: 'POST',
      headers,
      body: raw,
      redirect: 'follow',
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send SMS');
    }

    console.log('SMS sent successfully:', {
      messageId: result.data?.message_id,
      to,
      status: result.data?.status,
    });

    return {
      success: true,
      messageId: result.data?.message_id,
      status: result.data?.status,
    };
  } catch (error) {
    console.error('SMS sending failed:', error.message);
    throw new Error('Failed to send SMS');
  }
};

const sendBulkSMS = async (recipients, message) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const result = await sendSMS({ to: recipient, message });
      results.push({ recipient, success: true, ...result });
    } catch (error) {
      results.push({ recipient, success: false, error: error.message });
    }
  }

  return results;
};

// Code OTP (connexion chauffeur, changement de numéro, ou réinitialisation du code PIN)
const sendOtpCode = async (phoneNumber, code, purpose = 'SIGN_IN') => {
  const messages = {
    PHONE_CHANGE: `Votre code de confirmation Carbugui pour changer de numéro est : ${code}.\nCe code expire dans 10 minutes.`,
    PIN_RESET: `Votre code de réinitialisation du code PIN Carbugui est : ${code}.\nCe code expire dans 10 minutes.`,
  };

  const message = messages[purpose] || `Votre code de connexion Carbugui est : ${code}.\nCe code expire dans 10 minutes.`;

  return sendSMS({ to: phoneNumber, message });
};

// Notification à une station lorsqu'un compte est créé pour elle
const sendStationCredentials = async (phoneNumber, stationName, loginCode) => {
  const message = `Bienvenue sur Carbugui !\nUn accès a été créé pour la station "${stationName}".\nCode de connexion : ${loginCode}\nÉquipe Carbugui`;
  return sendSMS({ to: phoneNumber, message });
};

// Dates affichées à l'heure de Conakry (UTC+0, sans heure d'été).
const formatDateTimeFr = (date) => new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Conakry',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(date).replace(' ', ' à ');

const formatGnf = (amount) => `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\s/g, ' ')} GNF`;

// Confirmation au chauffeur une fois son paiement d'abonnement validé
const sendSubscriptionConfirmation = async (phoneNumber, { planLabel, amountGnf, startsAt, endsAt, merchantReference }) => {
  const startsLater = startsAt > new Date();
  const message = `Carbugui : paiement de ${formatGnf(amountGnf)} reçu, merci !\n`
    + `Abonnement ${planLabel} ${startsLater ? `actif du ${formatDateTimeFr(startsAt)} ` : 'actif '}`
    + `jusqu'au ${formatDateTimeFr(endsAt)}.\n`
    + `Réf : ${merchantReference}`;

  return sendSMS({ to: phoneNumber, message });
};

// Envoyé à un compte créé depuis l'app iPhone : l'app iOS ne vend rien
// (règles App Store), le pass s'achète sur la page web /pass.
const sendPassActivationLink = async (phoneNumber, passUrl) =>
  sendSMS({ to: phoneNumber, message: `Activez votre pass CARBUGUI : ${passUrl}` });

// Fin d'accès (dernière période terminée, aucune autre achetée d'avance)
const sendPassExpired = async (phoneNumber, passUrl) => {
  const message = 'CARBUGUI : votre pass a expiré.'
    + (passUrl ? `\nRenouvelez-le ici : ${passUrl}` : '\nRenouvelez-le depuis l\'application.');
  return sendSMS({ to: phoneNumber, message });
};

module.exports = {
  sendSMS,
  sendBulkSMS,
  sendOtpCode,
  sendStationCredentials,
  sendSubscriptionConfirmation,
  sendPassActivationLink,
  sendPassExpired,
};
