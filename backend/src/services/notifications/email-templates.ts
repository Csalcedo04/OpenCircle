import type { Notification } from "./sender";

// Plain-text emails, Spanish first and English below: OpenCircle's users are in Colombia, and
// the sender doesn't know the recipient's language. Money is formatted from minor units.

const money = ({ value, assetCode, assetScale }: { value: string; assetCode: string; assetScale: number }): string => {
  const units = BigInt(value);
  const base = 10n ** BigInt(assetScale);
  const whole = (units / base).toLocaleString("es-CO");
  const cents = assetScale === 0 ? "" : `,${(units % base).toString().padStart(assetScale, "0")}`;
  return `${whole}${cents} ${assetCode}`;
};

const day = (d: Date): string => d.toISOString().slice(0, 10);

export interface Email {
  subject: string;
  text: string;
}

export function renderEmail(n: Notification): Email {
  switch (n.kind) {
    case "COLLECTING":
      return {
        subject: `Comenzó el cobro en ${n.circleName} / Collection started in ${n.circleName}`,
        text: [
          `Comenzó el cobro de esta ronda de ${n.circleName}: tu aporte es de ${money(n.amount)} y vence el ${day(n.deadline)}. Tu billetera lo enviará sola si tienes una autorización activa.`,
          ``,
          `This round of ${n.circleName} is collecting: your payment is ${money(n.amount)}, due on ${day(n.deadline)}. Your wallet sends it on its own if you have an active approval.`,
        ].join("\n"),
      };
    case "DUE_SOON":
      return {
        subject: `Tu aporte a ${n.circleName} vence pronto / Your ${n.circleName} payment is due soon`,
        text: [
          `Tu aporte de ${money(n.amount)} a ${n.circleName} vence el ${day(n.deadline)}. Tu billetera lo enviará sola si tienes una autorización activa.`,
          ``,
          `Your ${money(n.amount)} payment to ${n.circleName} is due on ${day(n.deadline)}. Your wallet sends it on its own if you have an active approval.`,
        ].join("\n"),
      };
    case "DUE_TODAY":
      return {
        subject: `Hoy vence tu aporte a ${n.circleName} / Your ${n.circleName} payment is due today`,
        text: [
          `Hoy es el último día para tu aporte de ${money(n.amount)} a ${n.circleName}.`,
          ``,
          `Today is the last day for your ${money(n.amount)} payment to ${n.circleName}.`,
        ].join("\n"),
      };
    case "LATE":
      return {
        subject: `Aporte pendiente en ${n.circleName} / Overdue payment in ${n.circleName}`,
        text: [
          `Tu aporte de ${money(n.amount)} a ${n.circleName} venció el ${day(n.deadline)} y aún no llega. Revisa tu billetera.`,
          ``,
          `Your ${money(n.amount)} payment to ${n.circleName} was due on ${day(n.deadline)} and hasn't arrived. Check your wallet.`,
        ].join("\n"),
      };
    case "APPLICATION_RECEIVED":
      return {
        subject: `${n.applicantName} quiere unirse a ${n.circleName} / ${n.applicantName} wants to join ${n.circleName}`,
        text: [
          `${n.applicantName} pidió un cupo en ${n.circleName}. Entra a OpenCircle para aceptar o rechazar la solicitud.`,
          ``,
          `${n.applicantName} asked for a seat in ${n.circleName}. Open OpenCircle to accept or reject the application.`,
        ].join("\n"),
      };
    case "APPLICATION_ACCEPTED":
      return {
        subject: `${n.acceptedByName} aceptó a ${n.applicantName} en ${n.circleName} / ${n.acceptedByName} accepted ${n.applicantName} into ${n.circleName}`,
        text: [
          `${n.acceptedByName} aceptó a ${n.applicantName} en ${n.circleName}.`,
          ``,
          `${n.acceptedByName} accepted ${n.applicantName} into ${n.circleName}.`,
        ].join("\n"),
      };
    case "CIRCLE_INVITE": {
      const expiry = n.expiresAt === null ? null : day(n.expiresAt);
      return {
        subject: `${n.inviterName} te invita a ${n.circleName} / ${n.inviterName} invites you to ${n.circleName}`,
        text: [
          `${n.inviterName} te invitó al círculo de ahorro ${n.circleName} en OpenCircle.`,
          `Abre este enlace para ver el círculo y tomar tu cupo. Inicia sesión con este mismo correo.`,
          n.inviteUrl,
          expiry === null ? `La invitación no vence.` : `La invitación vence el ${expiry}.`,
          ``,
          `${n.inviterName} invited you to the ${n.circleName} savings circle on OpenCircle.`,
          `Open this link to see the circle and take your seat. Sign in with this same email address.`,
          n.inviteUrl,
          expiry === null ? `The invitation doesn't expire.` : `The invitation expires on ${expiry}.`,
        ].join("\n"),
      };
    }
  }
}
