from domain.models import ActionType

# Actions that the simulated sandbox can "complete". Anything else FAILS loudly
# rather than silently succeeding.
_PAYMENT_ACTIONS = {ActionType.RETRY_PAYMENT.value, ActionType.RETRY_BILLING.value}
_COMMS_ACTIONS = {
    ActionType.SEND_PAYMENT_REMINDER.value,
    ActionType.SEND_CHECKOUT_REMINDER.value,
    ActionType.SEND_SUBSCRIPTION_REMINDER.value,
    ActionType.SEND_INVOICE_REMINDER.value,
    ActionType.SEND_PROMISE_REMINDER.value,
    ActionType.SEND_PAYMENT_LINK.value,
    ActionType.REQUEST_PAYMENT_METHOD_UPDATE.value,
    ActionType.REQUEST_NEW_COMMITMENT.value,
    ActionType.OFFER_CHECKOUT_ASSISTANCE.value,
    ActionType.ESCALATE_COLLECTION.value,
}


class MockExecutionAdapter:
    def execute(self, execution_request: dict) -> dict:
        action = execution_request["action"]

        if action in _PAYMENT_ACTIONS:
            return {"adapter_status": "COMPLETED_SIMULATED",
                    "metadata": {"gateway": "mock_stripe", "message": "Payment retried successfully."}}
        if action in _COMMS_ACTIONS or "REMINDER" in action:
            return {"adapter_status": "COMPLETED_SIMULATED",
                    "metadata": {"gateway": "mock_twilio", "message": "Message sent."}}
        return {"adapter_status": "FAILED",
                "metadata": {"error": f"Unsupported action simulation: {action}"}}
