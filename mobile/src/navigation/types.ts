export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Map: undefined;
  OrderDetail: { orderId: string };
  MyOrders: undefined;
  Wallet: undefined;
  Profile: undefined;
  Chat: { orderId: string; orderTitle: string };
};
