import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { body, query, validationResult } from 'express-validator';

// Load environment variables
dotenv.config();

// Custom error classes for better error handling
class ValidationError extends Error {
	statusCode: number;
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
		this.statusCode = 400;
	}
}

class ConfigurationError extends Error {
	statusCode: number;
	constructor(message: string) {
		super(message);
		this.name = 'ConfigurationError';
		this.statusCode = 500;
	}
}

class NetworkError extends Error {
	statusCode: number;
	constructor(message: string, public originalError?: Error) {
		super(message);
		this.name = 'NetworkError';
		this.statusCode = 503;
	}
}

class ParsingError extends Error {
	statusCode: number;
	constructor(message: string, public originalError?: Error) {
		super(message);
		this.name = 'ParsingError';
		this.statusCode = 422;
	}
}

class UpstreamAPIError extends Error {
	statusCode: number;
	constructor(message: string, public upstreamStatus: number, public upstreamResponse?: any) {
		super(message);
		this.name = 'UpstreamAPIError';
		this.statusCode = upstreamStatus >= 500 ? 503 : upstreamStatus;
	}
}

class FoodTypeError extends Error {
	statusCode: number;
	constructor(message: string) {
		super(message);
		this.name = 'FoodTypeError';
		this.statusCode = 400;
	}
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const usdaApiKey = process.env.USDA_API_KEY;

// Rate limiting configuration
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: {
		error: 'Too many requests from this IP, please try again later.',
		retryAfter: '15 minutes'
	},
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all routes
app.use(limiter);

// Middlewares
app.use(cors());
app.use(express.json());

// Root endpoint with API documentation
app.get('/', (_req: Request, res: Response) => {
	const apiInfo = {
		name: 'Food API',
		version: process.env.npm_package_version || '0.1.0',
		description: 'A RESTful API to fetch food information from the USDA FoodData Central database',
		baseUrl: process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : `http://localhost:${port}`,
		endpoints: {
			root: {
				path: '/',
				method: 'GET',
				description: 'API documentation and welcome message'
			},
			health: {
				path: '/health',
				method: 'GET',
				description: 'Health check endpoint to verify API status and service connectivity'
			},
			foods: {
				path: '/foods',
				method: 'GET',
				description: 'Search for food items in the USDA database',
				queryParameters: {
					type: {
						required: true,
						type: 'string',
						description: 'Food type to search for (e.g., "apple", "chicken breast")',
						example: 'apple'
					},
					limit: {
						required: false,
						type: 'number',
						description: 'Maximum number of results to return (1-50, default: 10)',
						example: 10
					}
				},
				example: '/foods?type=apple&limit=5'
			}
		},
		rateLimiting: {
			windowMs: '15 minutes',
			maxRequests: 100,
			description: 'Rate limited to 100 requests per IP address per 15-minute window'
		},
		usdaDisclaimer: {
			important: 'USDA Data Disclaimer',
			message: 'This API provides access to data from the USDA FoodData Central database. The USDA requires the following disclaimer for all uses of their data:',
			disclaimer: 'The U.S. Department of Agriculture (USDA) prohibits discrimination against its customers, employees, and applicants for employment on the basis of race, color, national origin, age, disability, sex, gender identity, religion, reprisal, and where applicable, political beliefs, marital status, familial or parental status, sexual orientation, or all or part of an individual\'s income is derived from any public assistance program, or protected genetic information in employment or in any program or activity conducted or funded by the Department. (Not all prohibited bases apply to all programs and/or employment activities.)',
			additionalInfo: 'For more information about USDA data usage and policies, please visit: https://www.nal.usda.gov/fnic/fooddata-central'
		},
		contact: {
			message: 'For API support or questions, please refer to the project documentation or contact the development team.'
		}
	};

	return res.status(200).json(apiInfo);
});

// Enhanced health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
	try {
		const healthStatus: {
			status: string;
			timestamp: string;
			uptime: number;
			environment: string;
			version: string;
			services: {
				api: string;
				usda_api_key: string;
				usda_api?: string;
			};
		} = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || 'development',
			version: process.env.npm_package_version || '0.1.0',
			services: {
				api: 'healthy',
				usda_api_key: usdaApiKey ? 'configured' : 'missing'
			}
		};

		// Check if we can reach the USDA API (optional health check)
		if (usdaApiKey) {
			try {
				const testUrl = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
				testUrl.searchParams.set('api_key', usdaApiKey);
				testUrl.searchParams.set('query', 'test');
				testUrl.searchParams.set('pageSize', '1');

				const response = await fetch(testUrl.toString(), {
					method: 'GET',
					headers: { 'Accept': 'application/json' },
					signal: AbortSignal.timeout(5000) // 5 second timeout
				});

				healthStatus.services.usda_api = response.ok ? 'healthy' : 'unhealthy';
			} catch (error) {
				healthStatus.services.usda_api = 'unreachable';
			}
		} else {
			healthStatus.services.usda_api = 'not_configured';
		}

		return res.status(200).json(healthStatus);
	} catch (error) {
		return res.status(503).json({
			status: 'unhealthy',
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
});

// Input validation middleware for the foods endpoint
const validateFoodsQuery = [
	query('type')
		.trim()
		.notEmpty()
		.withMessage("Missing required query parameter 'type'")
		.isLength({ min: 1, max: 100 })
		.withMessage("Food type must be between 1 and 100 characters")
		.matches(/^[a-zA-Z0-9\s\-_]+$/)
		.withMessage("Food type can only contain letters, numbers, spaces, hyphens, and underscores"),
	query('limit')
		.optional()
		.isInt({ min: 1, max: 50 })
		.withMessage("Limit must be a number between 1 and 50")
];

// GET /foods?type=apple&limit=10
app.get('/foods', validateFoodsQuery, async (req: Request, res: Response, next: NextFunction) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const errorDetails = errors.array();
			throw new ValidationError(`Invalid request parameters: ${errorDetails.map(e => e.msg).join(', ')}`);
		}

		// Check configuration
		if (!usdaApiKey) {
			throw new ConfigurationError('Server misconfiguration: USDA API key is not configured. Please contact the administrator.');
		}

		const query = (req.query.type as string).trim();
		const limitRaw = (req.query.limit as string | undefined) ?? '10';
		
		// Enhanced parsing with better error handling
		let limit: number;
		try {
			const limitParsed = Number.parseInt(limitRaw, 10);
			if (!Number.isFinite(limitParsed) || limitParsed <= 0) {
				throw new ValidationError(`Invalid limit value: '${limitRaw}'. Limit must be a positive number.`);
			}
			limit = Math.min(limitParsed, 50); // cap to 50
		} catch (error) {
			if (error instanceof ValidationError) {
				throw error;
			}
			throw new ValidationError(`Invalid limit value: '${limitRaw}'. Limit must be a valid number.`);
		}

		// Validate food type more thoroughly
		if (!query || query.length === 0) {
			throw new FoodTypeError('Food type cannot be empty. Please provide a valid food type to search for.');
		}

		if (query.length < 2) {
			throw new FoodTypeError('Food type must be at least 2 characters long for meaningful search results.');
		}

		// Check for potentially problematic food types
		const problematicPatterns = [
			/^\d+$/, // Only numbers
			/^[^\w\s]+$/, // Only special characters
			/^(test|debug|admin|system)$/i // Reserved words
		];

		for (const pattern of problematicPatterns) {
			if (pattern.test(query)) {
				throw new FoodTypeError(`Invalid food type: '${query}'. Please provide a valid food name.`);
			}
		}

		const searchUrl = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
		searchUrl.searchParams.set('api_key', usdaApiKey);
		searchUrl.searchParams.set('query', query);
		searchUrl.searchParams.set('pageSize', String(limit));

		let response: globalThis.Response;
		try {
			response = await fetch(searchUrl.toString(), {
				method: 'GET',
				headers: {
					'Accept': 'application/json'
				},
				signal: AbortSignal.timeout(10000) // 10 second timeout
			});
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new NetworkError('Request to USDA API timed out. Please try again later.', error);
				}
				if (error.name === 'TypeError' && error.message.includes('fetch')) {
					throw new NetworkError('Failed to connect to USDA API. Please check your internet connection and try again.', error);
				}
			}
			throw new NetworkError('Network error occurred while fetching food data. Please try again later.', error instanceof Error ? error : undefined);
		}

		if (!response.ok) {
			let errorBody: any;
			try {
				errorBody = await response.json();
			} catch {
				errorBody = { message: 'Unknown upstream error' };
			}

			const statusMessages: Record<number, string> = {
				400: 'Invalid request sent to USDA API',
				401: 'USDA API authentication failed',
				403: 'Access to USDA API denied',
				404: 'USDA API endpoint not found',
				429: 'USDA API rate limit exceeded',
				500: 'USDA API internal server error',
				502: 'USDA API gateway error',
				503: 'USDA API service unavailable',
				504: 'USDA API gateway timeout'
			};

			const message = statusMessages[response.status] || 'USDA API error occurred';
			throw new UpstreamAPIError(message, response.status, errorBody);
		}

		let data: any;
		try {
			data = await response.json();
		} catch (error) {
			throw new ParsingError('Failed to parse response from USDA API. The response format is invalid.', error instanceof Error ? error : undefined);
		}

		// Validate response structure
		if (!data || typeof data !== 'object') {
			throw new ParsingError('Invalid response format from USDA API. Expected an object but received invalid data.');
		}

		const foods = Array.isArray(data?.foods) ? data.foods : [];

		const normalized = foods.map((item: any, index: number) => {
			try {
				const nutrients = Array.isArray(item?.foodNutrients) ? item.foodNutrients : [];
				const calories = getEnergyKcal(nutrients);
				const protein = getNutrientGrams(nutrients, ['1003', 'Protein']);
				const fat = getNutrientGrams(nutrients, ['1004', 'Total lipid (fat)', 'Total Fat']);
				const carbs = getNutrientGrams(nutrients, ['1005', 'Carbohydrate, by difference', 'Carbohydrate']);

				return {
					fdcId: item?.fdcId ?? null,
					description: item?.description ?? null,
					brandName: item?.brandName ?? item?.brandOwner ?? null,
					servingSize: item?.servingSize ?? null,
					servingSizeUnit: item?.servingSizeUnit ?? null,
					calories,
					macros: {
						protein_g: protein,
						carbs_g: carbs,
						fat_g: fat
					}
				};
			} catch (error) {
				// Log the error but continue processing other items
				console.warn(`Error processing food item at index ${index}:`, error);
				return null;
			}
		}).filter(Boolean); // Remove null items

		return res.status(200).json({
			query,
			limit,
			count: normalized.length,
			foods: normalized
		});
	} catch (err) {
		next(err);
	}
});

// Enhanced global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
	console.error('Error occurred:', err);

	// Handle custom error classes
	if (err instanceof ValidationError || 
		err instanceof ConfigurationError || 
		err instanceof NetworkError || 
		err instanceof ParsingError || 
		err instanceof UpstreamAPIError || 
		err instanceof FoodTypeError) {
		
		const errorResponse: any = {
			error: err.message,
			type: err.name,
			timestamp: new Date().toISOString()
		};

		// Add additional context for specific error types
		if (err instanceof UpstreamAPIError) {
			errorResponse.upstream_status = err.upstreamStatus;
			if (err.upstreamResponse) {
				errorResponse.upstream_details = err.upstreamResponse;
			}
		}

		if (err instanceof NetworkError && err.originalError) {
			errorResponse.original_error = err.originalError.message;
		}

		if (err instanceof ParsingError && err.originalError) {
			errorResponse.original_error = err.originalError.message;
		}

		return res.status(err.statusCode).json(errorResponse);
	}

	// Handle validation errors from express-validator
	if (err && typeof err === 'object' && 'array' in err) {
		return res.status(400).json({
			error: 'Validation failed',
			type: 'ValidationError',
			details: (err as any).array(),
			timestamp: new Date().toISOString()
		});
	}

	// Handle unknown errors
	const message = err instanceof Error ? err.message : 'An unexpected error occurred';
	return res.status(500).json({
		error: message,
		type: 'InternalServerError',
		timestamp: new Date().toISOString(),
		message: 'Please try again later or contact support if the problem persists.'
	});
});

// 404 handler for undefined routes
app.use('*', (req: Request, res: Response) => {
	res.status(404).json({
		error: 'Endpoint not found',
		type: 'NotFoundError',
		path: req.originalUrl,
		timestamp: new Date().toISOString(),
		message: 'The requested endpoint does not exist. Please check the URL and try again.'
	});
});

// Export the app for Vercel serverless functions
export default app;

// Only start the server if this file is run directly (not imported)
if (require.main === module) {
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Server listening on http://localhost:${port}`);
	});
}

async function safeJson(response: any): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

// Extract energy in kcal, converting from kJ if needed
function getEnergyKcal(nutrients: any[]): number | null {
	try {
		const match = findNutrient(nutrients, ['1008', 'Energy']);
		if (!match) return null;
		const unit = (match.unitName || match.unit || '').toLowerCase();
		const value = typeof match.value === 'number' ? match.value : Number(match.value);
		if (!Number.isFinite(value)) return null;
		if (unit === 'kj') {
			return Number((value / 4.184).toFixed(1));
		}
		return Number(value.toFixed(1));
	} catch (error) {
		console.warn('Error parsing energy value:', error);
		return null;
	}
}

// Extract grams for a nutrient; converts mg to g when necessary
function getNutrientGrams(nutrients: any[], idsOrNames: string[]): number | null {
	try {
		const match = findNutrient(nutrients, idsOrNames);
		if (!match) return null;
		const unit = (match.unitName || match.unit || '').toLowerCase();
		const value = typeof match.value === 'number' ? match.value : Number(match.value);
		if (!Number.isFinite(value)) return null;
		if (unit === 'mg') return Number((value / 1000).toFixed(2));
		return Number(value.toFixed(2));
	} catch (error) {
		console.warn('Error parsing nutrient value:', error);
		return null;
	}
}

// Finds nutrient by nutrientNumber or nutrientName
function findNutrient(nutrients: any[], idsOrNames: string[]): any | null {
	try {
		for (const n of nutrients) {
			const number = String((n.nutrientNumber ?? n.number ?? '')).trim();
			const name = String((n.nutrientName ?? n.name ?? '')).trim();
			if (idsOrNames.some(key => key === number || key.toLowerCase() === name.toLowerCase())) {
				return n;
			}
		}
		return null;
	} catch (error) {
		console.warn('Error finding nutrient:', error);
		return null;
	}
}
