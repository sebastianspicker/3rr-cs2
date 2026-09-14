/** Bounded per-server FIFO scheduling with a reserved coalesced heartbeat slot. */
import { RconCancelledError, RconDeadlineError, RconOverloadError } from './rconErrors';
import type { RconTaskClassification } from './rconTypes';

export interface RconScheduledTaskContext {
  readonly deadlineAt: number;
  readonly signal?: AbortSignal;
  markSent(): void;
  wasSent(): boolean;
  throwIfUnavailable(): void;
}

interface ScheduledJob {
  readonly sequence: number;
  readonly classification: RconTaskClassification;
  readonly deadlineAt: number;
  readonly signal?: AbortSignal;
  readonly promise: Promise<unknown>;
  readonly run: (context: RconScheduledTaskContext) => Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  expiryTimer?: ReturnType<typeof setTimeout>;
  abortListener?: () => void;
}

interface ServerQueue {
  active?: ScheduledJob;
  ordinary: ScheduledJob[];
  heartbeat?: ScheduledJob;
}

interface RconSchedulerOptions {
  maxQueuedPerServer: number;
  maxQueuedGlobal: number;
}

export class RconScheduler {
  private readonly queues = new Map<string, ServerQueue>();
  private queuedOrdinary = 0;
  private sequence = 0;
  private stopped = false;

  constructor(private readonly options: RconSchedulerOptions) {}

  schedule<T>(
    serverId: string,
    classification: RconTaskClassification,
    deadlineAt: number,
    signal: AbortSignal | undefined,
    run: (context: RconScheduledTaskContext) => Promise<T>
  ): Promise<T> {
    if (this.stopped) return Promise.reject(new RconCancelledError());
    if (signal?.aborted) return Promise.reject(new RconCancelledError());
    if (deadlineAt <= Date.now()) return Promise.reject(new RconDeadlineError());

    const queue = this.queues.get(serverId) ?? { ordinary: [] };
    this.queues.set(serverId, queue);
    if (classification === 'heartbeat') {
      const coalesced =
        queue.heartbeat ??
        (queue.active?.classification === 'heartbeat' ? queue.active : undefined);
      if (coalesced) return coalesced.promise as Promise<T>;
    } else if (
      queue.active &&
      (queue.ordinary.length >= this.options.maxQueuedPerServer ||
        this.queuedOrdinary >= this.options.maxQueuedGlobal)
    ) {
      return Promise.reject(new RconOverloadError());
    }

    let resolveJob!: (value: unknown) => void;
    let rejectJob!: (error: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });
    const job: ScheduledJob = {
      sequence: this.sequence++,
      classification,
      deadlineAt,
      signal,
      promise,
      run,
      resolve: resolveJob,
      reject: rejectJob,
    };

    if (!queue.active) {
      queue.active = job;
      this.start(serverId, queue, job);
    } else {
      if (classification === 'heartbeat') queue.heartbeat = job;
      else {
        queue.ordinary.push(job);
        this.queuedOrdinary += 1;
      }
      this.watchWhileQueued(serverId, queue, job);
    }
    return promise as Promise<T>;
  }

  cancelServer(serverId: string): void {
    const queue = this.queues.get(serverId);
    if (!queue) return;
    for (const job of [...queue.ordinary, ...(queue.heartbeat ? [queue.heartbeat] : [])]) {
      if (!this.removeQueued(queue, job)) continue;
      this.clearWatch(job);
      job.reject(new RconCancelledError());
    }
    this.cleanup(serverId, queue);
  }

  shutdown(): void {
    this.stopped = true;
    for (const serverId of [...this.queues.keys()]) this.cancelServer(serverId);
  }

  private watchWhileQueued(serverId: string, queue: ServerQueue, job: ScheduledJob): void {
    const remove = (error: Error) => {
      if (!this.removeQueued(queue, job)) return;
      this.clearWatch(job);
      job.reject(error);
      this.cleanup(serverId, queue);
    };
    const delay = Math.max(0, job.deadlineAt - Date.now());
    job.expiryTimer = setTimeout(() => remove(new RconDeadlineError()), delay);
    if (job.signal) {
      job.abortListener = () => remove(new RconCancelledError());
      job.signal.addEventListener('abort', job.abortListener, { once: true });
    }
  }

  private removeQueued(queue: ServerQueue, job: ScheduledJob): boolean {
    if (queue.heartbeat === job) {
      queue.heartbeat = undefined;
      return true;
    }
    const index = queue.ordinary.indexOf(job);
    if (index < 0) return false;
    queue.ordinary.splice(index, 1);
    this.queuedOrdinary -= 1;
    return true;
  }

  private start(serverId: string, queue: ServerQueue, job: ScheduledJob): void {
    this.clearWatch(job);
    let sent = false;
    const context: RconScheduledTaskContext = {
      deadlineAt: job.deadlineAt,
      signal: job.signal,
      markSent: () => {
        sent = true;
      },
      wasSent: () => sent,
      throwIfUnavailable: () => {
        if (job.signal?.aborted) throw new RconCancelledError(sent ? 'unknown' : 'not_sent');
        if (job.deadlineAt <= Date.now()) {
          throw new RconDeadlineError(sent ? 'unknown' : 'not_sent');
        }
      },
    };
    void job
      .run(context)
      .then(job.resolve, job.reject)
      .finally(() => {
        if (queue.active === job) queue.active = undefined;
        this.startNext(serverId, queue);
      });
  }

  private startNext(serverId: string, queue: ServerQueue): void {
    const ordinary = queue.ordinary[0];
    const heartbeat = queue.heartbeat;
    const next =
      ordinary && heartbeat
        ? ordinary.sequence < heartbeat.sequence
          ? ordinary
          : heartbeat
        : (ordinary ?? heartbeat);
    if (!next) {
      this.cleanup(serverId, queue);
      return;
    }
    if (next === heartbeat) queue.heartbeat = undefined;
    else {
      queue.ordinary.shift();
      this.queuedOrdinary -= 1;
    }
    queue.active = next;
    this.start(serverId, queue, next);
  }

  private clearWatch(job: ScheduledJob): void {
    if (job.expiryTimer !== undefined) clearTimeout(job.expiryTimer);
    if (job.signal && job.abortListener) job.signal.removeEventListener('abort', job.abortListener);
    job.expiryTimer = undefined;
    job.abortListener = undefined;
  }

  private cleanup(serverId: string, queue: ServerQueue): void {
    if (!queue.active && queue.ordinary.length === 0 && !queue.heartbeat) {
      this.queues.delete(serverId);
    }
  }
}
