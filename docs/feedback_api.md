# Feedback API Documentation

The feedback form sends a POST request to the endpoint specified in `VITE_FEEDBACK_API_URL`.

## Authentication

All requests include an `Authorization` header with a Bearer token:

```http
Authorization: Bearer your_feedback_secret
```

The secret is configured via `VITE_FEEDBACK_API_SECRET` in the site's environment.

## Request Format

- **Method**: `POST`
- **Content-Type**: `application/json`

### Payload Structure

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | `string` | One of: `"General Feedback"`, `"Feature Request"`, `"Bug"` |
| `text` | `string` | The feedback message content |
| `username` | `string` | The username of the submitter (if logged in) |
| `url` | `string` | The page URL where the feedback was submitted |
| `timestamp` | `string` | ISO 8601 timestamp |

### Example Request

```bash
curl -X POST https://your-bot-api.com/feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_feedback_secret" \
  -d '{
    "type": "Bug",
    "text": "The play button is misaligned on Safari mobile.",
    "username": "Calzone",
    "url": "https://nomplayer.com/player",
    "timestamp": "2024-04-14T07:55:00.000Z"
  }'
```
