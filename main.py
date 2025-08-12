# main.py
# اختبار الاتصال بـ RPC وعرض عنوان المحفظة ورصيد MATIC (Polygon)
# يعتمد على web3.py و python-dotenv
from dotenv import load_dotenv
from web3 import Web3
import os
import sys

load_dotenv()

RPC_URL = os.getenv("RPC_URL", "https://polygon-rpc.com")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "").strip()

def human_amount(wei):
    try:
        return Web3.fromWei(wei, "ether")
    except Exception:
        return wei

def main():
    print("🔌 محاولة الاتصال بـ RPC:", RPC_URL)
    try:
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))
    except Exception as e:
        print("❌ فشل إنشاء الموفر:", e)
        sys.exit(1)

    if not w3.is_connected():
        print("❌ غير متصل بالـ RPC — تحقق من RPC_URL")
        sys.exit(1)
    print("✅ متصل بالـ RPC بنجاح")

    try:
        chain_id = w3.eth.chain_id
        print(f"🌐 chainId: {chain_id}")
    except Exception:
        pass

    if PRIVATE_KEY:
        try:
            acct = w3.eth.account.from_key(PRIVATE_KEY)
            address = acct.address
            print("🔑 عنوان المحفظة (من المفتاح الخاص):", address)
            bal = w3.eth.get_balance(address)
            print("💰 رصيد المحفظة (wei):", bal)
            print("💠 رصيد بالمِنْطِقَة (MATIC):", float(human_amount(bal)))
        except Exception as e:
            print("❌ خطأ في استخدام المفتاح الخاص:", e)
    else:
        print("⚠️ لا يوجد PRIVATE_KEY في متغيرات البيئة (.env).")
        print("   يمكنك تشغيل هذا الملف دون مفتاح (قراءة فقط) أو إضافة المفتاح في الـ Codespace لاحقًا.")

if __name__ == "__main__":
    main()
