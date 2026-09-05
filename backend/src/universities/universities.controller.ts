import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UniversitiesService } from './universities.service';

// REQ-UNI-001/Q31: platform-wide catalog, same shape as GET /plans.
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  @Public()
  @Get()
  list() {
    return this.universitiesService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('university:manage')
  create(@Body() dto: CreateUniversityDto) {
    return this.universitiesService.create(dto);
  }
}
