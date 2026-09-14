/** Short-lived, generation-safe sharing for the four supported observation commands. */
import { RconCancelledError, RconDeadlineError } from './rconErrors';
import type {
  RconObservation,
  RconObservationOptions,
  RconObservedCommand,
  RconExecutionOutcome,
} from './rconTypes';

interface CacheEntry extends RconObservation {
  expiresAt: number;
  generation: number;
}

interface ObservationFlight {
  generation: number;
  sent: boolean;
  subscribers: number;
  settled: boolean;
  controller: AbortController;
  promise: Promise<RconObservation>;
}

type ObservationExecutor = (
  serverId: string,
  command: RconObservedCommand,
  deadlineAt: number,
  signal: AbortSignal,
  markSent: () => void
) => Promise<string>;

export class RconObservationCache {
  private readonly completed = new Map<string, CacheEntry>();
  private readonly flights = new Map<string, ObservationFlight>();
  private readonly generations = new Map<string, number>();
  private generationCounter = 0;
  private baselineGeneration = 0;

  constructor(
    private readonly execute: ObservationExecutor,
    private readonly createDeadline: () => number,
    private readonly ttlMs = 5000
  ) {}

  observe(
    serverId: string,
    command: RconObservedCommand,
    options: RconObservationOptions = {}
  ): Promise<RconObservation> {
    const outcome = this.subscriberOutcome(undefined);
    if (options.signal?.aborted) return Promise.reject(new RconCancelledError(outcome));
    if (options.deadlineAt !== undefined && options.deadlineAt <= Date.now()) {
      return Promise.reject(new RconDeadlineError(outcome));
    }

    const key = this.key(serverId, command);
    const generation = this.generation(serverId);
    let flight = this.flights.get(key);
    if (flight?.generation === generation) return this.subscribe(flight, options);

    const cached = this.completed.get(key);
    if (!options.refresh && cached?.generation === generation && cached.expiresAt > Date.now()) {
      return Promise.resolve({ value: cached.value, observedAt: cached.observedAt });
    }

    if (!flight || flight.generation !== generation) {
      flight = this.startFlight(key, serverId, command, generation);
      this.flights.set(key, flight);
    }
    return this.subscribe(flight, options);
  }

  invalidateServer(serverId: string): void {
    this.generations.set(serverId, ++this.generationCounter);
    const prefix = `${serverId}\u0000`;
    for (const key of this.completed.keys()) {
      if (key.startsWith(prefix)) this.completed.delete(key);
    }
  }

  clear(): void {
    for (const flight of this.flights.values()) flight.controller.abort();
    this.completed.clear();
    this.generations.clear();
    this.baselineGeneration = ++this.generationCounter;
  }

  private startFlight(
    key: string,
    serverId: string,
    command: RconObservedCommand,
    generation: number
  ): ObservationFlight {
    let effectiveGeneration = generation;
    const controller = new AbortController();
    const flight: ObservationFlight = {
      generation,
      sent: false,
      subscribers: 0,
      settled: false,
      controller,
      promise: Promise.resolve({ value: '', observedAt: '' }),
    };
    flight.promise = this.execute(
      serverId,
      command,
      this.createDeadline(),
      controller.signal,
      () => {
        flight.sent = true;
        effectiveGeneration = this.generation(serverId);
        flight.generation = effectiveGeneration;
      }
    )
      .then((value) => {
        const observedAt = new Date().toISOString();
        const observation = { value, observedAt };
        if (this.generation(serverId) === effectiveGeneration) {
          this.completed.set(key, {
            ...observation,
            expiresAt: Date.now() + this.ttlMs,
            generation: effectiveGeneration,
          });
        }
        return observation;
      })
      .finally(() => {
        flight.settled = true;
        if (this.flights.get(key) === flight) this.flights.delete(key);
      });
    return flight;
  }

  private subscribe(
    flight: ObservationFlight,
    options: RconObservationOptions
  ): Promise<RconObservation> {
    flight.subscribers += 1;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        flight.subscribers -= 1;
        if (flight.subscribers === 0 && !flight.settled) flight.controller.abort();
        callback();
      };
      const outcome = () => this.subscriberOutcome(flight);
      const onAbort = () => finish(() => reject(new RconCancelledError(outcome())));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.deadlineAt !== undefined) {
        timer = setTimeout(
          () => finish(() => reject(new RconDeadlineError(outcome()))),
          Math.max(0, options.deadlineAt - Date.now())
        );
      }
      void flight.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error))
      );
    });
  }

  private subscriberOutcome(flight: ObservationFlight | undefined): RconExecutionOutcome {
    return flight?.sent ? 'unknown' : 'not_sent';
  }

  private generation(serverId: string): number {
    return this.generations.get(serverId) ?? this.baselineGeneration;
  }

  private key(serverId: string, command: RconObservedCommand): string {
    return `${serverId}\u0000${command}`;
  }
}
