import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';

@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // TODO: Implement CRUD endpoints for clients
  // - GET /clients (list user's clients)
  // - POST /clients (create client)
  // - GET /clients/:id (get client by id)
  // - PATCH /clients/:id (update client)
  // - DELETE /clients/:id (delete client)
}