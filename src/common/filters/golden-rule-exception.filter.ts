import { 
  ArgumentsHost, 
  Catch, 
  ExceptionFilter, 
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GoldenRuleExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoldenRuleExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);
    
    // ✅ "Conservative in what you send" - Structured, predictable error format
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, request: Request): ErrorResponse {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Une erreur interne s\'est produite';
    let error = 'Erreur Interne';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const response = exceptionResponse as any;
        
        // ✅ "Liberal in what you accept" - Handle various error response formats
        message = response.message || response.error || message;
        error = response.error || this.getErrorNameFromStatus(status);
        
        // Transform validation errors to French
        if (Array.isArray(message)) {
          message = this.translateValidationErrors(message);
        } else if (typeof message === 'string') {
          message = this.translateSingleError(message);
        }
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      // ✅ Handle unexpected errors gracefully
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack);
      message = 'Une erreur inattendue s\'est produite';
    }

    return {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
  }

  private translateValidationErrors(errors: string[]): string[] {
    return errors.map(error => this.translateSingleError(error));
  }

  private translateSingleError(error: string): string {
    // ✅ "Liberal in what you accept" - Handle various error formats
    const translations: Record<string, string> = {
      // Common validation errors
      'email must be an email': 'L\'email doit être une adresse email valide',
      'password must be longer than or equal to 8 characters': 'Le mot de passe doit contenir au moins 8 caractères',
      'password should not be empty': 'Le mot de passe ne peut pas être vide',
      'email should not be empty': 'L\'email ne peut pas être vide',
      
      // HTTP errors
      'Unauthorized': 'Non autorisé',
      'Forbidden': 'Accès interdit',
      'Not Found': 'Ressource introuvable',
      'Bad Request': 'Requête invalide',
      
      // JWT errors  
      'jwt expired': 'Token expiré, veuillez vous reconnecter',
      'jwt malformed': 'Token invalide',
      'invalid signature': 'Signature de token invalide',
    };

    // Try exact match first
    if (translations[error]) {
      return translations[error];
    }

    // ✅ "Liberal in what you accept" - Try partial matches
    for (const [key, translation] of Object.entries(translations)) {
      if (error.toLowerCase().includes(key.toLowerCase())) {
        return translation;
      }
    }

    // Return original error if no translation found (graceful degradation)
    return error;
  }

  private getErrorNameFromStatus(status: number): string {
    const statusNames: Record<number, string> = {
      400: 'Requête Invalide',
      401: 'Non Autorisé', 
      403: 'Accès Interdit',
      404: 'Introuvable',
      409: 'Conflit',
      422: 'Données Invalides',
      429: 'Trop de Requêtes',
      500: 'Erreur Interne',
      502: 'Passerelle Défaillante',
      503: 'Service Indisponible',
    };

    return statusNames[status] || 'Erreur';
  }
}