import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { CheckoutController } from './checkout.controller';
import {
  PAYMENT_PROCESS_CLIENT,
  PAYMENT_RETRY_CLIENT,
} from './payment.constants';
import { PaymentController } from './payment.controller';
import { PaymentProcessor } from './payment.processor';
import { PaymentService } from './payment.service';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: PAYMENT_PROCESS_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: config.get<string>(
              'RABBITMQ_PROCESS_QUEUE',
              'payment-process',
            ),
            queueOptions: { durable: true },
            persistent: true,
          },
        }),
      },
      {
        name: PAYMENT_RETRY_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: config.get<string>('RABBITMQ_RETRY_QUEUE', 'payment-retry'),
            queueOptions: { durable: true },
            persistent: true,
          },
        }),
      },
    ]),
  ],
  controllers: [PaymentController, CheckoutController, PaymentProcessor],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
