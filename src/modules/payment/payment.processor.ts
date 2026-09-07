import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, ConsumeMessage } from 'amqplib';
import {
  PAYMENT_PROCESS_PATTERN,
  PAYMENT_RETRY_PATTERN,
} from './payment.constants';
import { PaymentException } from './payment.exception';
import { PaymentService } from './payment.service';

type PaymentJob = { paymentId: string; userId: string };

@Controller()
export class PaymentProcessor {
  constructor(private readonly paymentService: PaymentService) {}

  @EventPattern(PAYMENT_PROCESS_PATTERN)
  async process(@Payload() job: PaymentJob, @Ctx() context: RmqContext) {
    await this.handle(job, context);
  }

  @EventPattern(PAYMENT_RETRY_PATTERN)
  async retry(@Payload() job: PaymentJob, @Ctx() context: RmqContext) {
    await this.handle(job, context);
  }

  private async handle(job: PaymentJob, context: RmqContext) {
    try {
      await this.paymentService.processPayment(job.paymentId, job.userId);
    } catch (error) {
      if (!(error instanceof PaymentException)) throw error;
    }
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;
    channel.ack(message);
  }
}
