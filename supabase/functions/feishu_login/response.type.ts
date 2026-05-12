// 登录成功完整返回值
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  feishu_user: FeishuUser;
}

// 认证用户信息
export interface AuthUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string;
  phone: string;
  confirmed_at: string;
  last_sign_in_at: string;
  app_metadata: AppMetadata;
  user_metadata: UserMetadata;
  identities: Identity[];
  created_at: string;
  updated_at: string;
  is_anonymous: boolean;
}

export interface AppMetadata {
  provider: string;
  providers: string[];
}

export interface UserMetadata {
  avatar: string;
  email_verified: boolean;
  feishu_uid: string;
  name: string;
}

export interface Identity {
  identity_id: string;
  id: string;
  user_id: string;
  identity_data: IdentityData;
  provider: string;
  last_sign_in_at: string;
  created_at: string;
  updated_at: string;
  email: string;
}

export interface IdentityData {
  email: string;
  email_verified: boolean;
  phone_verified: boolean;
  sub: string;
}

// 飞书用户信息
export interface FeishuUser {
  avatar_big: string;
  avatar_middle: string;
  avatar_thumb: string;
  avatar_url: string;
  en_name: string;
  name: string;
  open_id: string;
  tenant_key: string;
  union_id: string;
}