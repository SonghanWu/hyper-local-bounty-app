# TODO - Future Enhancements

## 1. Map Integration (地图功能)

### 需求
- 实时地图显示附近订单（bounties）位置
- 当前用户位置标记
- 点击订单marker显示详情（标题、赏金、距离）
- 不同订单状态用不同颜色标记（PENDING/ACCEPTED）

### 技术方案
**React Native地图库选择：**
- `react-native-maps` (推荐) - 支持iOS/Android
- 或 `expo-location` + `react-native-map-view`

### 实现步骤

#### Mobile端
```typescript
// mobile/src/screens/MapScreen.tsx
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function MapScreen() {
  const [nearbyOrders, setNearbyOrders] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [searchRadius, setSearchRadius] = useState(2000); // Default 2km

  // 1. 获取当前位置
  useEffect(() => {
    locationService.getCurrentLocation().then(setCurrentLocation);
  }, []);

  // 2. 定期查询附近订单（每10秒）
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentLocation) {
        api.get('/orders/nearby', {
          params: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            radius: searchRadius,
          }
        }).then(response => {
          if (response.data.success) {
            setNearbyOrders(response.data.orders);
          }
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentLocation, searchRadius]);

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      region={{
        latitude: currentLocation?.latitude || 42.2776,
        longitude: currentLocation?.longitude || -83.7382,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      {/* 当前用户位置 */}
      {currentLocation && (
        <Marker
          coordinate={currentLocation}
          title="You"
          pinColor="blue"
        />
      )}

      {/* 附近订单 */}
      {nearbyOrders.map(order => (
        <Marker
          key={order.id}
          coordinate={{
            latitude: order.latitude,
            longitude: order.longitude,
          }}
          title={order.title}
          description={`$${order.rewardAmount} - ${order.distance.toFixed(0)}m away`}
          pinColor={order.status === 'PENDING' ? 'red' : 'orange'}
          onCalloutPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
        />
      ))}
    </MapView>
  );
}
```

#### 安装依赖
```bash
cd mobile
npx expo install react-native-maps
```

#### 配置（app.json）
```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow app to use your location."
        }
      ]
    ],
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_IOS_API_KEY"
      }
    },
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_API_KEY"
        }
      }
    }
  }
}
```

### 预计工作量
- 基础地图集成：2小时
- 订单marker显示：1小时
- 实时更新逻辑：1小时
- 点击跳转订单详情：1小时
**总计：约5小时**

---

## 2. Background Location Updates (后台位置更新)

### 需求
用户关闭app后，仍能接收附近订单推送，且位置相对准确（不是1小时前的旧位置）。

### 技术方案
使用iOS/Android的**Significant Location Change（SLC）** API：
- 移动距离>500米才触发
- 低电量消耗
- 后台自动唤醒app

### 实现步骤

#### 1. Mobile端 - 后台位置服务

```typescript
// mobile/src/services/background-location.service.ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// 定义后台任务
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];

    // 获取token
    const token = await SecureStore.getItemAsync('token');
    if (!token) return;

    // HTTP POST到后端（不是WebSocket，因为app可能被挂起）
    try {
      await fetch('http://YOUR_API/location/background-update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        })
      });

      console.log('Background location updated');
    } catch (error) {
      console.error('Failed to update background location:', error);
    }
  }
});

class BackgroundLocationService {
  async requestPermissions(): Promise<boolean> {
    // 请求"始终允许"权限
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  }

  async startBackgroundTracking(): Promise<boolean> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.error('Background location permission denied');
      return false;
    }

    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 500, // 移动500米触发
        deferredUpdatesInterval: 300000, // 最多5分钟延迟
        foregroundService: {
          notificationTitle: 'Bounty App',
          notificationBody: 'Tracking location for nearby tasks'
        }
      });

      console.log('Background location tracking started');
      return true;
    } catch (error) {
      console.error('Failed to start background tracking:', error);
      return false;
    }
  }

  async stopBackgroundTracking(): Promise<void> {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('Background location tracking stopped');
    } catch (error) {
      console.error('Failed to stop background tracking:', error);
    }
  }

  async isTracking(): Promise<boolean> {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export default new BackgroundLocationService();
```

#### 2. Backend端 - HTTP endpoint

```typescript
// backend/src/location/location.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

@Controller('location')
export class LocationController {
  constructor(private usersService: UsersService) {}

  @Post('background-update')
  @UseGuards(JwtAuthGuard)
  async handleBackgroundLocationUpdate(
    @Body() data: { latitude: number; longitude: number },
    @CurrentUser() user: User
  ) {
    // 检查用户是否启用了后台位置
    if (!user.backgroundLocationEnabled) {
      return {
        success: false,
        error: 'Background location not enabled'
      };
    }

    // 只更新PostgreSQL（Redis用于实时在线用户）
    await this.usersService.updateUserLocation(user.id, {
      lastLatitude: data.latitude,
      lastLongitude: data.longitude,
      lastLocationUpdatedAt: new Date()
    });

    return { success: true };
  }
}
```

#### 3. 用户设置页面

```typescript
// mobile/src/screens/SettingsScreen.tsx
import backgroundLocationService from '../services/background-location.service';

export default function SettingsScreen() {
  const [bgLocationEnabled, setBgLocationEnabled] = useState(false);

  const toggleBackgroundLocation = async (enabled: boolean) => {
    if (enabled) {
      const started = await backgroundLocationService.startBackgroundTracking();
      if (started) {
        setBgLocationEnabled(true);
        // 更新数据库
        await api.post('/users/settings', {
          backgroundLocationEnabled: true
        });
      }
    } else {
      await backgroundLocationService.stopBackgroundTracking();
      setBgLocationEnabled(false);
      await api.post('/users/settings', {
        backgroundLocationEnabled: false
      });
    }
  };

  return (
    <View>
      <Text>Background Location Updates</Text>
      <Switch
        value={bgLocationEnabled}
        onValueChange={toggleBackgroundLocation}
      />
      <Text style={{ fontSize: 12, color: 'gray' }}>
        Keep your location updated when app is closed (uses minimal battery)
      </Text>
    </View>
  );
}
```

### 注意事项

1. **用户权限**
   - iOS需要在Info.plist说明理由
   - 用户需要手动在设置中选择"始终允许"
   - App Store审核会严格检查

2. **电池消耗**
   - SLC模式：低电量（推荐）
   - 连续GPS：高电量（不推荐后台使用）

3. **更新频率**
   - SLC: 500米+变化或5-15分钟
   - 不是实时，但对推送通知足够准确

4. **隐私声明**
   - 必须在隐私政策中说明用途
   - 给用户明确的开关控制

### 预计工作量
- Backend HTTP endpoint：1小时
- Mobile后台服务：3小时
- 设置页面UI：2小时
- 权限处理：2小时
- 测试和调试：3小时
**总计：约11小时**

### 建议实施时机
- **Phase 4+** （非MVP必需）
- 先完成订单系统和推送通知
- 根据用户反馈决定是否需要

---

## 3. 数据库优化（Database Optimization）

### 需求分析
当前`users`表包含：
- **用户基本信息**：email, phone, password, name（很少修改）
- **位置信息**：lastLatitude, lastLongitude, lastLocationUpdatedAt（每5秒更新）

**问题：**
- 位置频繁更新导致`users`表写入压力大
- 查询用户信息时可能读到热更新的位置数据（缓存失效）

### 方案：垂直分表（Vertical Partitioning）

#### 方案1：拆分为两个表（推荐用于大规模）

```sql
-- 用户基本信息表（低频写入，高频读取）
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  phone VARCHAR UNIQUE,
  password VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  avatar VARCHAR,
  rating NUMERIC(3,2) DEFAULT 0,
  pushNotificationsEnabled BOOLEAN DEFAULT TRUE,
  backgroundLocationEnabled BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- 用户位置表（高频写入）
CREATE TABLE user_locations (
  userId UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  accuracy NUMERIC,  -- GPS精度（米）
  updatedAt TIMESTAMP,
  INDEX idx_location_updated (updatedAt),
  -- PostGIS索引（用于地理查询）
  -- CREATE INDEX idx_location_geo ON user_locations USING GIST (ST_MakePoint(longitude, latitude));
);
```

**优点：**
- ✅ 用户表更小，缓存友好
- ✅ 位置更新不影响用户表
- ✅ 可以针对位置表优化（分区、压缩）
- ✅ 更清晰的职责分离

**缺点：**
- ❌ 查询时需要JOIN（如果同时需要用户+位置）
- ❌ 增加代码复杂度
- ❌ 对小到中型应用可能过度设计

#### 方案2：保持单表 + 优化索引（推荐用于当前阶段）

```sql
-- 当前表结构保持不变
-- 仅添加索引优化

-- 1. 位置时效性查询索引
CREATE INDEX idx_users_location_updated ON users (lastLocationUpdatedAt)
WHERE lastLocationUpdatedAt IS NOT NULL;

-- 2. 推送通知查询索引（组合索引）
CREATE INDEX idx_users_push_location ON users (pushNotificationsEnabled, lastLocationUpdatedAt)
WHERE pushNotificationsEnabled = true;

-- 3. PostGIS空间索引（地理查询）
CREATE INDEX idx_users_location_geo ON users
USING GIST (ST_MakePoint(lastLongitude, lastLatitude))
WHERE lastLatitude IS NOT NULL AND lastLongitude IS NOT NULL;
```

**优点：**
- ✅ 简单，无需修改现有代码
- ✅ 查询无需JOIN，性能更好（小到中型数据）
- ✅ 索引已经能解决大部分性能问题

**缺点：**
- ❌ 大规模时（百万级用户）仍有写入热点

### 性能对比分析

#### 当前场景（MVP阶段）
- **用户数量**：< 10,000
- **位置更新频率**：每5秒/用户（仅在线用户）
- **同时在线用户**：假设10%在线 = 1,000用户
- **每秒写入**：1000 / 5 = 200次/秒

**结论：单表 + 索引完全够用**

#### 大规模场景（成熟产品）
- **用户数量**：> 1,000,000
- **同时在线**：10% = 100,000
- **每秒写入**：100,000 / 5 = 20,000次/秒

**结论：需要垂直分表 + 分区 + 读写分离**

### 推荐实施策略

**Phase 3-4（当前）：**
```sql
-- Users表索引优化
CREATE INDEX idx_users_location_updated ON users (lastLocationUpdatedAt);
CREATE INDEX idx_users_push_enabled ON users (pushNotificationsEnabled);

-- Orders表索引优化（Phase 3新增）
-- 1. 订单状态索引（查询PENDING订单）
CREATE INDEX idx_orders_status ON orders (status);

-- 2. PostGIS空间索引（附近订单查询，加速ST_DWithin）
CREATE INDEX idx_orders_location_geo ON orders
USING GIST (ST_MakePoint(longitude, latitude))
WHERE status = 'PENDING';

-- 3. 订单时间索引（按创建时间排序）
CREATE INDEX idx_orders_created ON orders (createdAt DESC);
```

**Phase 5+（用户>10万）：**
- 实施垂直分表
- 添加数据库分区（按时间/地区）
- 读写分离（主从复制）

### 其他性能优化

#### 1. 批量写入
```typescript
// 当前：每次位置更新都写数据库
await usersService.updateUserLocation(userId, location);

// 优化：累积后批量写入（每30秒一次）
const locationBuffer = new Map<string, Location>();

// 累积位置更新
locationBuffer.set(userId, location);

// 定时批量写入
setInterval(async () => {
  const updates = Array.from(locationBuffer.entries());
  await usersRepository.bulkUpdate(updates);
  locationBuffer.clear();
}, 30000);
```

#### 2. PostgreSQL连接池优化
```typescript
// backend/src/app.module.ts
TypeOrmModule.forRoot({
  // ...
  poolSize: 20,  // 增加连接池大小
  extra: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
  },
})
```

#### 3. 部分字段更新
```typescript
// 当前：更新整个user对象
await usersRepository.save(user);

// 优化：仅更新位置字段
await usersRepository
  .createQueryBuilder()
  .update(User)
  .set({
    lastLatitude: lat,
    lastLongitude: lng,
    lastLocationUpdatedAt: new Date()
  })
  .where('id = :id', { id: userId })
  .execute();
```

### 预计工作量

**方案1（垂直分表）：**
- 数据库迁移：2小时
- 代码重构：5小时
- 测试：3小时
**总计：10小时**

**方案2（索引优化）：**
- 添加索引：30分钟
- 测试验证：1小时
**总计：1.5小时**

### 建议

**现阶段（MVP）：**
✅ 实施方案2（索引优化）
- 成本低、风险小
- 性能提升明显
- 无需修改代码

**未来（10万+用户）：**
⏳ 根据监控数据决定是否垂直分表
- 监控数据库CPU、IOPS
- 监控查询延迟
- 如果出现瓶颈，再实施方案1

---

## 4. Chat & Live Updates（Phase 5）

### 需求
- 订单级别1对1聊天（requester与helper）
- 在线状态显示（"对方正在输入..."）
- 实时订单状态更新通知

### 技术方案：使用Redis TTL判断在线状态

**CRITICAL:** 在线判断必须查询Redis TTL，不是PostgreSQL

```typescript
// backend/src/chat/chat.gateway.ts
@WebSocketGateway()
export class ChatGateway {
  constructor(
    private redisService: RedisService,
    private usersService: UsersService
  ) {}

  // 检查用户是否在线
  async isUserOnline(userId: string): Promise<boolean> {
    // ✅ 正确：查询Redis TTL
    const ttl = await this.redisService.client.ttl(`user:${userId}:ttl`);
    return ttl > 0;  // TTL存在且>0表示在线

    // ❌ 错误：不要查PostgreSQL的lastLocationUpdatedAt
    // PostgreSQL包含所有用户（在线+离线）
  }

  // 发送在线状态
  async emitUserStatus(orderId: string) {
    const order = await this.ordersService.findById(orderId);

    // 检查requester和helper在线状态
    const requesterOnline = await this.isUserOnline(order.requesterId);
    const helperOnline = order.helperId
      ? await this.isUserOnline(order.helperId)
      : false;

    // 向订单room广播在线状态
    this.server.to(`order:${orderId}`).emit('user_status', {
      requester: { online: requesterOnline },
      helper: { online: helperOnline }
    });
  }

  // 处理"正在输入"事件
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string }
  ) {
    const userId = client.data.userId;

    // 检查是否在线（防止假typing事件）
    const isOnline = await this.isUserOnline(userId);
    if (!isOnline) return;

    // 向订单room广播（排除发送者）
    client.to(`order:${data.orderId}`).emit('user_typing', {
      userId,
      typing: true
    });
  }
}
```

**在线状态显示示例（Mobile）：**
```typescript
// mobile/src/screens/ChatScreen.tsx
export default function ChatScreen({ orderId }: Props) {
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // 监听在线状态
    websocketService.on('user_status', (data) => {
      // 根据当前用户角色判断
      const otherUserOnline = isRequester
        ? data.helper.online
        : data.requester.online;
      setIsOtherUserOnline(otherUserOnline);
    });

    // 监听"正在输入"
    websocketService.on('user_typing', (data) => {
      setIsTyping(data.typing);
      setTimeout(() => setIsTyping(false), 3000);
    });

    return () => {
      websocketService.off('user_status');
      websocketService.off('user_typing');
    };
  }, []);

  return (
    <View>
      {/* 在线状态指示 */}
      <View style={styles.header}>
        <Text>{otherUserName}</Text>
        {isOtherUserOnline && (
          <View style={styles.onlineDot} />
        )}
      </View>

      {/* 正在输入指示 */}
      {isTyping && (
        <Text style={styles.typingText}>对方正在输入...</Text>
      )}
    </View>
  );
}
```

### 为什么必须用Redis TTL而不是PostgreSQL？

| 场景 | Redis TTL | PostgreSQL lastLocationUpdatedAt |
|------|-----------|----------------------------------|
| 用户在线（app前台） | ✅ TTL存在 | ✅ 最近更新 |
| 用户后台（5分钟内） | ❌ TTL过期 | ✅ 最近更新 |
| 用户关闭app（1小时内） | ❌ TTL过期 | ✅ 最近更新 |
| 用户关闭app（1天前） | ❌ TTL过期 | ❌ 旧数据 |

**结论：**
- Redis TTL = 真实在线状态（WebSocket连接+位置更新）
- PostgreSQL = 最后位置（用于push通知，不代表在线）

### 预计工作量
- Chat room管理：2小时
- 在线状态检测（Redis TTL）：1小时
- 聊天消息存储：3小时
- 移动端UI：4小时
**总计：约10小时**

---

## 5. 邮箱验证增强（Email Verification Enhancement）

### 需求
当前系统允许任意邮箱注册，无验证流程。需要添加邮箱验证确保用户身份真实性。

### 实现方案

#### 后端实现

**1. 修改User Entity**
```typescript
// backend/src/users/user.entity.ts
@Entity('users')
export class User {
  // ... existing fields ...

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  verificationToken: string;

  @Column({ nullable: true })
  verificationTokenExpiry: Date;
}
```

**2. 邮件发送服务**
```typescript
// backend/src/mail/mail.service.ts
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    // 使用Gmail SMTP（或其他邮件服务）
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendVerificationEmail(email: string, token: string) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    await this.transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Verify your email - Bounty App',
      html: `
        <h2>Welcome to Bounty App!</h2>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>
      `,
    });
  }
}
```

**3. 注册流程修改**
```typescript
// backend/src/auth/auth.service.ts
async register(registerDto: RegisterDto) {
  // Create user
  const user = await this.usersRepository.create({
    ...registerDto,
    emailVerified: false,
    verificationToken: crypto.randomBytes(32).toString('hex'),
    verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  await this.usersRepository.save(user);

  // Send verification email
  await this.mailService.sendVerificationEmail(user.email, user.verificationToken);

  return {
    message: 'Registration successful. Please check your email to verify your account.',
    user: { id: user.id, email: user.email },
  };
}

async verifyEmail(token: string) {
  const user = await this.usersRepository.findOne({
    where: { verificationToken: token },
  });

  if (!user) {
    throw new BadRequestException('Invalid verification token');
  }

  if (user.verificationTokenExpiry < new Date()) {
    throw new BadRequestException('Verification token expired');
  }

  user.emailVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpiry = null;

  await this.usersRepository.save(user);

  return { message: 'Email verified successfully' };
}
```

**4. 验证Guard**
```typescript
// backend/src/auth/guards/email-verified.guard.ts
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before accessing this resource');
    }

    return true;
  }
}

// 应用到需要验证的endpoint
@Controller('orders')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class OrdersController {
  // 只有验证过邮箱的用户可以发布/接受订单
}
```

#### 前端实现

**1. 验证页面**
```typescript
// mobile/src/screens/VerifyEmailScreen.tsx
export default function VerifyEmailScreen() {
  const [email, setEmail] = useState('');

  const resendVerification = async () => {
    await api.post('/auth/resend-verification', { email });
    Alert.alert('Success', 'Verification email sent');
  };

  return (
    <View>
      <Text>Please verify your email</Text>
      <Text>We sent a verification link to {email}</Text>
      <Button onPress={resendVerification}>Resend Email</Button>
    </View>
  );
}
```

**2. 验证提醒**
```typescript
// mobile/src/screens/HomeScreen.tsx
useEffect(() => {
  checkEmailVerification();
}, []);

const checkEmailVerification = async () => {
  const user = await api.get('/auth/me');
  if (!user.data.emailVerified) {
    Alert.alert(
      'Email Not Verified',
      'Please verify your email to access all features',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Verify Now', onPress: () => navigation.navigate('VerifyEmail') }
      ]
    );
  }
};
```

### 邮件服务选择

**选项1: Gmail SMTP（推荐开发测试）**
- 免费
- 每天500封限制
- 需要"应用专用密码"（App Password）

**选项2: SendGrid（推荐生产环境）**
- 免费tier: 100封/天
- 专业邮件服务，送达率高
- API简单易用

**选项3: AWS SES**
- 便宜，可扩展
- 需要AWS账号

### 环境变量配置

```env
# backend/.env
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FRONTEND_URL=exp://192.168.x.x:8081  # Expo development URL
```

### 安全考虑

1. **Token安全**
   - 使用加密随机token（crypto.randomBytes）
   - 24小时过期时间
   - 验证后立即删除token

2. **防滥用**
   - 限制重发验证邮件频率（每5分钟最多1次）
   - 记录发送日志

3. **隐私保护**
   - 不在响应中泄露用户是否存在
   - 验证失败统一返回"Invalid or expired token"

### 预计工作量
- 后端实现（Entity, Service, Controller）: 3小时
- 邮件服务集成: 2小时
- 前端UI: 2小时
- 测试: 1小时
**总计：约8小时**

### 实施优先级
⏳ **Phase 4-5** - 非MVP必需，但建议在公开发布前实施

---

## 6. 其他待优化项

### 6.1 推送通知集成（Phase 3-4优先）
- [ ] APNs（iOS）集成
- [ ] FCM（Android）集成
- [ ] 推送token存储
- [ ] 订单推送模板

### 6.2 位置精度过滤
- [ ] 过滤精度>100m的GPS读数
- [ ] 显示位置精度指示器
- [ ] 位置精度字段存储

### 5.3 用户偏好设置
- [ ] 推送距离偏好（1km/2km/5km）
- [ ] 工作时间偏好
- [ ] 常用地址（家/公司）

### 5.4 缓存优化
- [ ] Redis连接池
- [ ] 用户信息缓存（减少数据库查询）
- [ ] WebSocket消息压缩

---

## 7. 地理围栏（Geofencing）- 订单距离监控 ✅ 已完成

### 实现状态
✅ **已于Phase 3实现** - 前端地理围栏方案

### 已实现功能
当用户（Requester或Helper）距离订单位置超过500米时：
1. ✅ 发送本地通知提醒用户"您已远离订单位置"
2. ✅ 显示警告弹窗询问是否取消订单
3. ✅ 每5分钟最多一次提醒（防止spam，即cooldown机制）
4. ✅ Requester监控：发布订单时自动启动，PENDING/ACCEPTED状态时持续监控
5. ✅ Helper监控：接受订单时自动启动，ACCEPTED状态时监控
6. ✅ 自动清理：订单完成/取消时停止监控

### 功能价值
- ✅ 防止Helper接单后走太远无法完成任务
- ✅ 提升订单完成率
- ✅ 保护Requester利益

### 技术实现方案（已采用）

#### 方案1：前端地理围栏（推荐 - 简单）

**实现难度**: ⭐⭐ 中等

**核心逻辑**:
```typescript
// mobile/src/services/geofencing.service.ts
class GeofencingService {
  private monitoredOrders: Map<string, {
    latitude: number;
    longitude: number;
    maxDistance: number; // 单位：米
  }> = new Map();

  // 开始监控订单
  startMonitoring(orderId: string, orderLocation: {lat: number, lng: number}, maxDistance = 500) {
    this.monitoredOrders.set(orderId, {
      latitude: orderLocation.lat,
      longitude: orderLocation.lng,
      maxDistance,
    });
  }

  // 检查位置是否超出范围
  checkLocation(currentLocation: {latitude: number, longitude: number}) {
    this.monitoredOrders.forEach((order, orderId) => {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        order.latitude,
        order.longitude
      );

      if (distance > order.maxDistance) {
        this.triggerWarning(orderId, distance, order.maxDistance);
      }
    });
  }

  // 计算两点距离（Haversine公式）
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // 地球半径（米）
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // 返回距离（米）
  }

  // 触发警告
  private triggerWarning(orderId: string, currentDistance: number, maxDistance: number) {
    // 本地通知
    this.sendLocalNotification(
      'Distance Alert',
      `You are ${Math.round(currentDistance)}m away from the order location (max: ${maxDistance}m)`
    );

    // 可选：通过事件通知UI
    // EventEmitter.emit('geofence-violated', { orderId, currentDistance, maxDistance });
  }

  // 发送本地通知
  private async sendLocalNotification(title: string, body: string) {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // 立即触发
    });
  }

  // 停止监控
  stopMonitoring(orderId: string) {
    this.monitoredOrders.delete(orderId);
  }
}

export default new GeofencingService();
```

**集成到location.service.ts**:
```typescript
// 在handleLocationUpdate中添加
private handleLocationUpdate(location: Location.LocationObject) {
  // ... 现有代码 ...

  // 检查地理围栏
  geofencingService.checkLocation({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });
}
```

**在OrderDetailScreen接受订单时启动监控**:
```typescript
const handleAcceptOrder = async () => {
  const response = await api.post(`/orders/${orderId}/accept`);
  if (response.data.success) {
    // 启动地理围栏监控
    geofencingService.startMonitoring(orderId, {
      lat: order.latitude,
      lng: order.longitude,
    }, 500); // 500米警戒距离

    Alert.alert('Success', 'Order accepted! Stay within 500m of the location.');
  }
};
```

**需要的库**:
```bash
npx expo install expo-notifications
```

#### 方案2：后台位置追踪 + 原生地理围栏（复杂）

**实现难度**: ⭐⭐⭐⭐ 较难

需要配置后台位置权限（iOS需要特殊审核）、使用`expo-task-manager`和`expo-location`的后台任务。

**不推荐原因**:
- iOS后台位置追踪需要App Store审核理由
- 耗电量高
- 用户隐私担忧
- 配置复杂

### 实现步骤（方案1 - 推荐）

#### Step 1: 创建Geofencing Service
```bash
touch mobile/src/services/geofencing.service.ts
```

实现上面的GeofencingService代码

#### Step 2: 安装通知库
```bash
cd mobile
npx expo install expo-notifications
```

#### Step 3: 配置通知权限
在`app.json`中添加：
```json
{
  "expo": {
    "notification": {
      "icon": "./assets/notification-icon.png"
    },
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["fetch", "remote-notification"]
      }
    },
    "android": {
      "permissions": ["NOTIFICATIONS"]
    }
  }
}
```

#### Step 4: 集成到LocationService
在`location.service.ts`的`handleLocationUpdate`方法中调用`geofencingService.checkLocation()`

#### Step 5: UI集成
- OrderDetailScreen: 接受订单时调用`startMonitoring()`
- OrderDetailScreen: 完成/取消订单时调用`stopMonitoring()`
- 添加"Distance Alert"对话框，询问用户是否取消订单

### 配置选项

可添加到用户设置：
```typescript
interface GeofenceSettings {
  enabled: boolean;            // 是否启用地理围栏
  alertDistance: number;       // 警报距离（米），默认500
  autoPromptCancel: boolean;   // 是否自动弹出取消对话框
  notificationEnabled: boolean; // 是否发送本地通知
}
```

### 测试方案

**模拟器测试**:
1. 在Xcode/Android Studio中使用Location Simulation
2. 设置模拟路径，让位置从订单附近移动到远处
3. 验证通知和警告是否触发

**真机测试**:
1. 接受附近的测试订单
2. 实际走动超过500米
3. 观察通知和应用内警告

### 预估工作量
- GeofencingService实现: 2小时
- 通知集成: 1小时
- UI集成（OrderDetailScreen）: 1小时
- 测试和调试: 1小时
**总计：约5小时**

### 优先级
⏳ **Phase 4-5** - Nice to have，非MVP必需功能

### 备注
- 方案1（前端监控）足够满足需求，且易于实现
- 只在用户开启Location Tracking时工作（合理限制）
- 不消耗额外后台电量
- 用户体验友好
