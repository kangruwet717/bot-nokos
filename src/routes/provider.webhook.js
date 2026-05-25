const express = require('express');
const prisma = require('../config/prisma');
const OrderStatus = require('../constants/orderStatus');
const { notifyTelegram } = require('../services/notification.service');
const env = require('../config/env');
const { stringifyJsonField } = require('../utils/jsonField');

const router = express.Router();

router.post('/smsbower', async (req, res, next) => {
  try {
    const clientIp = String(req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
    if (
      env.SMSBOWER_WEBHOOK_ALLOWED_IP_SET.size > 0 &&
      !env.SMSBOWER_WEBHOOK_ALLOWED_IP_SET.has(clientIp)
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const payload = req.body || {};
    await prisma.webhookLog.create({
      data: {
        source: 'smsbower',
        headers: stringifyJsonField(req.headers),
        payload: stringifyJsonField(payload) || '{}',
        isValid: true,
        processed: false
      }
    });

    const activationId = String(payload.activationId || '');
    if (!activationId) return res.status(400).json({ error: 'activationId required' });

    const order = await prisma.order.findUnique({ where: { providerOrderId: activationId }, include: { user: true } });
    if (!order) return res.json({ status: 'SUCCESS' });

    if (order.status !== OrderStatus.SMS_RECEIVED) {
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.SMS_RECEIVED,
          otpCode: payload.code ? String(payload.code) : null,
          smsText: payload.text ? String(payload.text) : null,
          smsReceivedAt: payload.receivedAt ? new Date(payload.receivedAt) : new Date()
        },
        include: { user: true }
      });
      await notifyTelegram(
        updated.user.telegramId,
        `OTP diterima\n\nNomor: ${updated.phoneNumber}\nKode OTP: ${updated.otpCode || '-'}\nPesan: ${updated.smsText || '-'}`
      );
    }

    res.json({ status: 'SUCCESS' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
