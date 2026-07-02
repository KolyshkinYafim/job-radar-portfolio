import { Injectable } from '@nestjs/common';
import { WpJobManagerCollector } from '../wp-job-manager.collector';

@Injectable()
export class JobspressoCollector extends WpJobManagerCollector {
  readonly name = 'jobspresso';
  protected readonly feedUrl = 'https://jobspresso.co/?feed=job_feed';
}
