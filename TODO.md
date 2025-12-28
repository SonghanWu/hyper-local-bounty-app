# TODO - Future Enhancements

## 1. Map Integration (地图功能)

### 需求
- 实时地图显示附近在线用户位置
- 地图显示附近订单（bounties）
- 当前用户位置标记
- 点击用户/订单显示详情

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
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  // 1. 获取当前位置
  useEffect(() => {
    locationService.getCurrentLocation().then(setCurrentLocation);
  }, []);

  // 2. 定期查询附近用户（每10秒）
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentLocation) {
        websocketService.getNearbyUsers(
          currentLocation.latitude,
          currentLocation.longitude,
          5000 // 5km radius
        ).then(response => {
          if (response.success) {
            setNearbyUsers(response.users);
          }
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentLocation]);

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

      {/* 附近在线用户 */}
      {nearbyUsers.map(user => (
        <Marker
          key={user.member}
          coordinate={{
            latitude: user.coordinates.latitude,
            longitude: user.coordinates.longitude,
          }}
          title={`User ${user.distance.toFixed(0)}m away`}
          pinColor="green"
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
- 用户标记显示：1小时
- 实时更新逻辑：1小时
- 样式优化：1小时
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
-- 仅添加索引优化
CREATE INDEX idx_users_location_updated ON users (lastLocationUpdatedAt);
CREATE INDEX idx_users_push_enabled ON users (pushNotificationsEnabled);
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

## 4. 其他待优化项

### 4.1 推送通知集成（Phase 3优先）
- [ ] APNs（iOS）集成
- [ ] FCM（Android）集成
- [ ] 推送token存储
- [ ] 订单推送模板

### 4.2 位置精度过滤
- [ ] 过滤精度>100m的GPS读数
- [ ] 显示位置精度指示器
- [ ] 位置精度字段存储

### 4.3 用户偏好设置
- [ ] 推送距离偏好（1km/2km/5km）
- [ ] 工作时间偏好
- [ ] 常用地址（家/公司）

### 4.4 缓存优化
- [ ] Redis连接池
- [ ] 用户信息缓存（减少数据库查询）
- [ ] WebSocket消息压缩
