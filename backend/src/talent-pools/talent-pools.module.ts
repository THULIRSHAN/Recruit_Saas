import { Module } from '@nestjs/common';
import { TalentPoolsController } from './talent-pools.controller';
import { TalentPoolsService } from './talent-pools.service';

@Module({
  controllers: [TalentPoolsController],
  providers: [TalentPoolsService],
})
export class TalentPoolsModule {}
