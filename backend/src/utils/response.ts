import { APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from '../types/api';

const getCorsHeaders = () => {
  const allowedOrigin = process.env.CORS_ORIGIN || '*';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
};

export function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  const response: ApiResponse<T> = { success: true, data };
  return { statusCode, headers: getCorsHeaders(), body: JSON.stringify(response) };
}

export function errorResponse(error: string, statusCode = 400): APIGatewayProxyResult {
  const response: ApiResponse = { success: false, error };
  return { statusCode, headers: getCorsHeaders(), body: JSON.stringify(response) };
}

export function messageResponse(message: string, statusCode = 200): APIGatewayProxyResult {
  const response: ApiResponse = { success: true, message };
  return { statusCode, headers: getCorsHeaders(), body: JSON.stringify(response) };
}
