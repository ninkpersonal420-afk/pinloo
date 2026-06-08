import { onRequestOptions as __check_pro_js_onRequestOptions } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\check-pro.js"
import { onRequestPost as __check_pro_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\check-pro.js"
import { onRequestOptions as __claude_js_onRequestOptions } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\claude.js"
import { onRequestPost as __claude_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\claude.js"
import { onRequestOptions as __send_otp_js_onRequestOptions } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\send-otp.js"
import { onRequestPost as __send_otp_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\send-otp.js"
import { onRequestPost as __stripe_webhook_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\stripe-webhook.js"
import { onRequestOptions as __verify_otp_js_onRequestOptions } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\verify-otp.js"
import { onRequestPost as __verify_otp_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\verify-otp.js"
import { onRequestOptions as __verify_stripe_js_onRequestOptions } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\verify-stripe.js"
import { onRequestPost as __verify_stripe_js_onRequestPost } from "C:\\Users\\ninkp\\OneDrive\\Documents\\pinloo-main\\pinloo-main\\functions\\verify-stripe.js"

export const routes = [
    {
      routePath: "/check-pro",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__check_pro_js_onRequestOptions],
    },
  {
      routePath: "/check-pro",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__check_pro_js_onRequestPost],
    },
  {
      routePath: "/claude",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__claude_js_onRequestOptions],
    },
  {
      routePath: "/claude",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__claude_js_onRequestPost],
    },
  {
      routePath: "/send-otp",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__send_otp_js_onRequestOptions],
    },
  {
      routePath: "/send-otp",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__send_otp_js_onRequestPost],
    },
  {
      routePath: "/stripe-webhook",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__stripe_webhook_js_onRequestPost],
    },
  {
      routePath: "/verify-otp",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__verify_otp_js_onRequestOptions],
    },
  {
      routePath: "/verify-otp",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__verify_otp_js_onRequestPost],
    },
  {
      routePath: "/verify-stripe",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__verify_stripe_js_onRequestOptions],
    },
  {
      routePath: "/verify-stripe",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__verify_stripe_js_onRequestPost],
    },
  ]