import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JOB_COLLECTORS } from './collector.interface';
import type { JobCollector } from './collector.interface';
import { ArbeitnowCollector } from './sources/arbeitnow.collector';
import { AshbyCollector } from './sources/ashby.collector';
import { EuRemoteJobsCollector } from './sources/euremotejobs.collector';
import { GreenhouseCollector } from './sources/greenhouse.collector';
import { HabrCareerCollector } from './sources/habr-career.collector';
import { HackerNewsCollector } from './sources/hackernews.collector';
import { HimalayasCollector } from './sources/himalayas.collector';
import { HirehiCollector } from './sources/hirehi.collector';
import { HirifyCollector } from './sources/hirify.collector';
import { JobicyCollector } from './sources/jobicy.collector';
import { JobspressoCollector } from './sources/jobspresso.collector';
import { JustJoinCollector } from './sources/justjoin.collector';
import { JustRemoteCollector } from './sources/justremote.collector';
import { LandingJobsCollector } from './sources/landing-jobs.collector';
import { LeverCollector } from './sources/lever.collector';
import { NoFluffJobsCollector } from './sources/nofluffjobs.collector';
import { RemoteOkCollector } from './sources/remoteok.collector';
import { RemoteRocketshipCollector } from './sources/remoterocketship.collector';
import { RemotiveCollector } from './sources/remotive.collector';
import { WeWorkRemotelyCollector } from './sources/weworkremotely.collector';
import { WorkingNomadsCollector } from './sources/workingnomads.collector';
import { CollectionSchedulerService } from './collection-scheduler.service';
import { PipelineModule } from '../pipeline/pipeline.module';

const COLLECTOR_CLASSES = [
  ArbeitnowCollector,
  AshbyCollector,
  EuRemoteJobsCollector,
  GreenhouseCollector,
  HabrCareerCollector,
  HackerNewsCollector,
  HimalayasCollector,
  HirehiCollector,
  HirifyCollector,
  JobicyCollector,
  JobspressoCollector,
  JustJoinCollector,
  JustRemoteCollector,
  LandingJobsCollector,
  LeverCollector,
  NoFluffJobsCollector,
  RemoteOkCollector,
  RemoteRocketshipCollector,
  RemotiveCollector,
  WeWorkRemotelyCollector,
  WorkingNomadsCollector,
];

@Module({
  imports: [ScheduleModule.forRoot(), PipelineModule],
  providers: [
    ...COLLECTOR_CLASSES,
    {
      provide: JOB_COLLECTORS,
      useFactory: (...collectors: JobCollector[]) => collectors,
      inject: [...COLLECTOR_CLASSES],
    },
    CollectionSchedulerService,
  ],
  exports: [CollectionSchedulerService],
})
export class CollectorsModule {}
