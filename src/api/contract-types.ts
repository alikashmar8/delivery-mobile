import type {
  ApiErrorResponse,
  ApiRequestBodyFor,
  ApiResponseFor,
} from "./api-client";

type Assert<Condition extends true> = Condition;
type IsString<Value> = [Value] extends [string]
  ? string extends Value
    ? true
    : false
  : false;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;

type LoginRequest = ApiRequestBodyFor<"/auth/login/password", "post">;
type LoginResponse = ApiResponseFor<"/auth/login/password", "post">;
type DeliveryRequest = ApiRequestBodyFor<"/deliveries", "post">;
type DeliveryList = ApiResponseFor<"/deliveries", "get">;
type DeliveryCreated = ApiResponseFor<"/deliveries", "post">;

type DeliveryReceiptRequest = ApiRequestBodyFor<"/deliveries/{id}/payments", "post">;
type DriverActionResponse = ApiResponseFor<"/deliveries/{id}/actions", "post">;

export type ContractTypeAssertions = [
  Assert<IsString<DeliveryReceiptRequest["amount"]>>,
  Assert<IsString<DeliveryReceiptRequest["receiptId"]>>,
  Assert<"COMPLETED" extends DriverActionResponse["status"] ? true : false>,
  Assert<IsString<LoginRequest["email"]>>,
  Assert<IsString<LoginResponse["accessToken"]>>,
  Assert<HasKey<DeliveryRequest, "recipient">>,
  Assert<HasKey<DeliveryRequest, "pickupAddress">>,
  Assert<HasKey<DeliveryList, "items">>,
  Assert<IsString<NonNullable<DeliveryCreated["pricingRuleId"]>>>,
  Assert<IsString<ApiErrorResponse["error"]["requestId"]>>,
];
