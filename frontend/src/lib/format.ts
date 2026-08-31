export const money = (n: any) =>
    '$' + Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (n: any) =>
    n === null || n === undefined ? '—' : `${Math.round(Number(n) * 100)}%`;

const amt = (v: any) => (v && typeof v === 'object' ? v.amount : v);
export const moneyMaybe = (v: any) => money(amt(v));

// plain words for backend enums ------------------------------------------------
export const WHY_FAILED: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'Not enough money in the account',
    NETWORK_FAILURE: 'A temporary network / bank glitch',
    PAYMENT_METHOD_INVALID: 'The card / payment method is no longer valid',
    PAYMENT_FRICTION: 'The customer got stuck at payment',
    MANDATE_FAILURE: 'The recurring-payment authorisation broke',
    UNRESOLVED_DISPUTE: 'There is an open dispute on the invoice',
    MISSED_COMMITMENT: 'The customer missed a promised payment date',
    CONFLICTING_EVIDENCE: 'The signals disagree — needs a look',
    UNKNOWN: 'Cause not clear from the data',
};

export const ACTION: Record<string, string> = {
    RETRY_PAYMENT: 'Retry the payment',
    RETRY_BILLING: 'Retry the charge',
    REQUEST_PAYMENT_METHOD_UPDATE: 'Ask the customer to update their card',
    SEND_PAYMENT_REMINDER: 'Send a payment reminder',
    SEND_CHECKOUT_REMINDER: 'Send a checkout reminder',
    OFFER_CHECKOUT_ASSISTANCE: 'Offer checkout help',
    SEND_SUBSCRIPTION_REMINDER: 'Send a subscription reminder',
    SEND_INVOICE_REMINDER: 'Send an invoice reminder',
    SEND_PAYMENT_LINK: 'Send a payment link',
    ESCALATE_COLLECTION: 'Hand to collections',
    SEND_PROMISE_REMINDER: 'Remind about the promised payment',
    REQUEST_NEW_COMMITMENT: 'Ask for a new payment date',
    ESCALATE_TO_HUMAN: 'Send to a person to decide',
    NO_ACTION_POSSIBLE: 'Nothing to do',
};

// { label, tone } for status pills -------------------------------------------
type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple';

export function safetyCheck(status?: string): { label: string; tone: Tone; help: string } {
    switch (status) {
        case 'PERMITTED': return { label: 'Approved to run', tone: 'green', help: 'Safe to act automatically.' };
        case 'WAIT': return { label: 'Waiting', tone: 'amber', help: 'In a cool-down period; try again later.' };
        case 'ESCALATE': return { label: 'Needs your OK', tone: 'amber', help: 'A person must approve this one.' };
        case 'DENIED': return { label: 'Blocked', tone: 'red', help: 'A safety rule stops this action.' };
        default: return { label: 'Not checked yet', tone: 'gray', help: '' };
    }
}

export function outcome(status?: string): { label: string; tone: Tone } {
    switch (status) {
        case 'FULLY_RECOVERED': return { label: 'Recovered in full', tone: 'green' };
        case 'PARTIALLY_RECOVERED': return { label: 'Partly recovered', tone: 'amber' };
        case 'NOT_RECOVERED': return { label: 'Not recovered', tone: 'red' };
        case 'PENDING_VERIFICATION': return { label: 'Checking result', tone: 'blue' };
        default: return { label: 'Not run yet', tone: 'gray' };
    }
}

export function riskWord(level?: string): { label: string; tone: Tone } {
    switch (level) {
        case 'CRITICAL': return { label: 'Critical', tone: 'red' };
        case 'HIGH': return { label: 'High', tone: 'red' };
        case 'MEDIUM': return { label: 'Medium', tone: 'amber' };
        case 'LOW': return { label: 'Low', tone: 'gray' };
        default: return { label: '—', tone: 'gray' };
    }
}

export const CATEGORY: Record<string, string> = {
    FAILED_PAYMENT: 'Failed payment',
    CHECKOUT_ABANDONMENT: 'Abandoned checkout',
    FAILED_SUBSCRIPTION: 'Failed subscription',
    OVERDUE_INVOICE: 'Overdue invoice',
    BROKEN_PROMISE: 'Broken promise to pay',
};
