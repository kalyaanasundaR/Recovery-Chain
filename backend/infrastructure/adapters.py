from domain.models import ActionType

class MockExecutionAdapter:
    def execute(self, execution_request: dict) -> dict:
        action = execution_request["action"]
        
        # Simulated responses based on action
        if action == ActionType.RETRY_PAYMENT.value or action == ActionType.RETRY_BILLING.value:
            return {"adapter_status": "COMPLETED_SIMULATED", "metadata": {"gateway": "mock_stripe", "message": "Payment retried successfully."}}
        elif "REMINDER" in action or action == ActionType.REQUEST_PAYMENT_METHOD_UPDATE.value or action == ActionType.OFFER_CHECKOUT_ASSISTANCE.value:
            return {"adapter_status": "COMPLETED_SIMULATED", "metadata": {"gateway": "mock_twilio", "message": "Message sent."}}
        else:
            return {"adapter_status": "FAILED", "metadata": {"error": "Unsupported action simulation."}}
