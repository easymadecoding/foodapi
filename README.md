# Food API

A robust Express.js API that fetches food information from the USDA Food Database with built-in rate limiting, input validation, and health monitoring.

## Features

- 🍎 **Food Search**: Search for foods using the USDA Food Database
- 🛡️ **Rate Limiting**: Prevents abuse with configurable rate limits
- ✅ **Input Validation**: Comprehensive validation for all inputs
- 🏥 **Health Monitoring**: Detailed health check endpoint
- 🔒 **Security**: CORS enabled and input sanitization
- 📊 **Nutritional Data**: Returns calories and macronutrients

## Installation

```bash
npm install
```

## Environment Variables

### Local Development
Create a `.env` file in the root directory:

```env
PORT=3000
USDA_API_KEY=your_usda_api_key_here
NODE_ENV=development
```

### Vercel Deployment
Set these environment variables in your Vercel project dashboard:

- `USDA_API_KEY`: Your USDA API key (required)
- `NODE_ENV`: `production` (recommended)

Get your USDA API key from: https://fdc.nal.usda.gov/api-key-signup.html

## Usage

### Development
```bash
npm run dev
```

### Production (Local)
```bash
npm run build
npm start
```

### Vercel Deployment

This API is configured for deployment on Vercel. Follow these steps:

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel
   ```

3. **Set Environment Variables** in Vercel Dashboard:
   - Go to your project settings
   - Add the following environment variables:
     - `USDA_API_KEY`: Your USDA API key
     - `NODE_ENV`: `production`

4. **Redeploy** after setting environment variables:
   ```bash
   vercel --prod
   ```

The API will be available at your Vercel URL (e.g., `https://your-project.vercel.app`).

## API Endpoints

### Health Check
**GET** `/health`

Returns comprehensive health status of the API and its dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "environment": "development",
  "version": "0.1.0",
  "services": {
    "api": "healthy",
    "usda_api_key": "configured",
    "usda_api": "healthy"
  }
}
```

### Food Search
**GET** `/foods?type={food_name}&limit={number}`

Search for foods in the USDA database.

**Parameters:**
- `type` (required): Food name to search for (1-100 characters, alphanumeric + spaces, hyphens, underscores)
- `limit` (optional): Number of results to return (1-50, default: 10)

**Example Request:**
```bash
curl "http://localhost:3000/foods?type=apple&limit=5"
```

**Example Response:**
```json
{
  "query": "apple",
  "limit": 5,
  "count": 5,
  "foods": [
    {
      "fdcId": 1102653,
      "description": "Apple, raw, with skin",
      "brandName": null,
      "servingSize": 100,
      "servingSizeUnit": "g",
      "calories": 52,
      "macros": {
        "protein_g": 0.26,
        "carbs_g": 13.81,
        "fat_g": 0.17
      }
    }
  ]
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Window**: 15 minutes
- **Limit**: 100 requests per IP address
- **Headers**: Rate limit information is included in response headers

When rate limit is exceeded:
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

## Input Validation

### Food Search Validation Rules

- **type parameter**:
  - Required
  - 1-100 characters
  - Only alphanumeric characters, spaces, hyphens, and underscores allowed
- **limit parameter**:
  - Optional (default: 10)
  - Must be an integer between 1 and 50

### Validation Error Response
```json
{
  "error": "Validation failed",
  "details": [
    {
      "type": "field",
      "value": "apple@#$",
      "msg": "Food type can only contain letters, numbers, spaces, hyphens, and underscores",
      "path": "type",
      "location": "query"
    }
  ]
}
```

## Error Handling

The API provides detailed error responses for various scenarios:

- **400 Bad Request**: Invalid input parameters
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server configuration issues
- **503 Service Unavailable**: Upstream API issues

## Testing

Run the test script to verify all features:

```bash
# Start the server first
npm run dev

# In another terminal, run tests
node test-api.js
```

## Dependencies

- **express**: Web framework
- **express-rate-limit**: Rate limiting middleware
- **express-validator**: Input validation
- **cors**: Cross-origin resource sharing
- **dotenv**: Environment variable management

## License

MIT
