import { ConflictException, Injectable } from '@nestjs/common';
import * as domain from '@mybuild/shared';
export { INITIAL_ORDER_STATUS, OrderEventType, type OrderStateContext, type OrderEvent, type OrderSideEffect, type OrderTransitionResult } from '@mybuild/shared';

export class InvalidStateTransitionError extends ConflictException {
  readonly fromStatus: ConstructorParameters<typeof domain.InvalidStateTransitionError>[0];
  readonly event: ConstructorParameters<typeof domain.InvalidStateTransitionError>[1];
  constructor(...args: ConstructorParameters<typeof domain.InvalidStateTransitionError>) {
    super(new domain.InvalidStateTransitionError(...args).getResponse());
    this.fromStatus = args[0];
    this.event = args[1];
  }
}

export class InvalidOfferStatusError extends ConflictException {
  readonly offerStatus: ConstructorParameters<typeof domain.InvalidOfferStatusError>[0];
  readonly event: ConstructorParameters<typeof domain.InvalidOfferStatusError>[1];
  constructor(...args: ConstructorParameters<typeof domain.InvalidOfferStatusError>) {
    super(new domain.InvalidOfferStatusError(...args).getResponse());
    this.offerStatus = args[0];
    this.event = args[1];
  }
}

export class OfferExpiredError extends ConflictException {

  constructor(...args: ConstructorParameters<typeof domain.OfferExpiredError>) {
    super(new domain.OfferExpiredError(...args).getResponse());

  }
}

export class OfferChangedError extends ConflictException {

  constructor(...args: ConstructorParameters<typeof domain.OfferChangedError>) {
    super(new domain.OfferChangedError(...args).getResponse());

  }
}

export class OfferFinallyRejectedError extends ConflictException {

  constructor(...args: ConstructorParameters<typeof domain.OfferFinallyRejectedError>) {
    super(new domain.OfferFinallyRejectedError(...args).getResponse());

  }
}

/** HTTP adapter; all transition rules live in shared. */
@Injectable()
export class OrderStateMachine extends domain.OrderStateMachine {
  override transition(context: domain.OrderStateContext, event: domain.OrderEvent): domain.OrderTransitionResult {
    try { return super.transition(context, event); }
    catch (error) {
      if (error instanceof domain.InvalidStateTransitionError) throw new InvalidStateTransitionError(error.fromStatus, error.event);
      if (error instanceof domain.InvalidOfferStatusError) throw new InvalidOfferStatusError(error.offerStatus, error.event);
      if (error instanceof domain.OfferExpiredError) throw new OfferExpiredError();
      if (error instanceof domain.OfferChangedError) throw new OfferChangedError();
      if (error instanceof domain.OfferFinallyRejectedError) throw new OfferFinallyRejectedError();
      throw error;
    }
  }
}
