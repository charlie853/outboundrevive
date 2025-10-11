import { getCurrentUserInfo } from '@/lib/account';

export default async function UserInfo() {
  const userInfo = await getCurrentUserInfo();

  if (!userInfo) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <span className="font-medium">{userInfo.email}</span>
        {userInfo.accountName && (
          <>
            <span className="text-gray-400">•</span>
            <span>{userInfo.accountName}</span>
          </>
        )}
      </div>
    </div>
  );
}