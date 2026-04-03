import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  id: string;
  email: string;
  rolle: string;
}

export async function handler(event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  try {
    const token = event.authorizationToken?.replace('Bearer ', '');
    if (!token) throw new Error('No token provided');

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Wildcard Resource für effizientes Caching
    const arnParts = event.methodArn.split(':');
    const apiGatewayArnParts = arnParts[5].split('/');
    const wildcardArn = arnParts.slice(0, 5).join(':') + ':' + apiGatewayArnParts[0] + '/' + apiGatewayArnParts[1] + '/*';

    return {
      principalId: decoded.id,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: wildcardArn,
        }],
      },
      context: {
        userId: decoded.id,
        email: decoded.email,
        rolle: decoded.rolle,
      },
    };
  } catch (error) {
    console.error('Authorization error:', error);
    throw new Error('Unauthorized');
  }
}
