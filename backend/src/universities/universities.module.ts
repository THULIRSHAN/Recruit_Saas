import { Module } from '@nestjs/common';
import { PartnershipsController } from './partnerships.controller';
import { UniversitiesController } from './universities.controller';
import { UniversitiesService } from './universities.service';

@Module({
  controllers: [UniversitiesController, PartnershipsController],
  providers: [UniversitiesService],
})
export class UniversitiesModule {}
