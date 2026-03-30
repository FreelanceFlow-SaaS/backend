import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // TODO: Implement CRUD endpoints for services (prestations)
  // - GET /services (list user's services)
  // - POST /services (create service)
  // - GET /services/:id (get service by id)
  // - PATCH /services/:id (update service)
  // - DELETE /services/:id (delete service)
}