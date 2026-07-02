import { Injectable } from '@nestjs/common';
import type { RemoteMode } from '../../common/types';
import { WpJobManagerCollector } from '../wp-job-manager.collector';

@Injectable()
export class EuRemoteJobsCollector extends WpJobManagerCollector {
  readonly name = 'euremotejobs';
  protected readonly feedUrl = 'https://euremotejobs.com/?feed=job_feed';
  protected readonly defaultRemote: RemoteMode = 'remote-eu';
}
