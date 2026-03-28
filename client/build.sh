#!/bin/bash
# 构建脚本 - 支持 Linux 和 Android

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认值
BUILD_TYPE="Release"
ABI="arm64-v8a"
NDK_ROOT="$HOME/android-ndk-r27d/android-ndk-r27d"

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--debug)
            BUILD_TYPE="Debug"
            shift
            ;;
        -a|--abi)
            ABI="$2"
            shift 2
            ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  -d, --debug      调试编译"
            echo "  -a, --abi <ABI>  目标 ABI (默认: arm64-v8a)"
            echo "  -h, --help       显示帮助"
            echo ""
            echo "示例:"
            echo "  $0                    # Linux Release"
            echo "  $0 -d                 # Linux Debug"
            echo "  $0 -a arm64-v8a       # Android ARM64"
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "构建 OpenClaw C++ 客户端"
echo "========================================"
echo "构建类型: $BUILD_TYPE"
echo "目标 ABI: $ABI"

# 清理旧构建
rm -rf build

# 创建构建目录
mkdir -p build && cd build

# 检查是否使用 Android NDK
if [ -d "$NDK_ROOT" ]; then
    echo "使用 Android NDK: $NDK_ROOT"
    echo ""
    echo "交叉编译 Android..."
    cmake .. \
        -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
        -DCMAKE_TOOLCHAIN_FILE="$NDK_ROOT/build/cmake/android.toolchain.cmake" \
        -DANDROID_ABI="$ABI" \
        -DANDROID_PLATFORM=android-24 \
        -DBUILD_EXAMPLES=ON
else
    echo "Android NDK 未找到: $NDK_ROOT"
    echo ""
    echo "构建 Linux 版本..."
    cmake .. \
        -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
        -DBUILD_EXAMPLES=ON
fi

# 编译
echo ""
echo "编译中..."
make -j$(nproc)

echo ""
echo "========================================"
echo "构建完成!"
echo "========================================"
echo ""
echo "输出文件:"
ls -la bin/ 2>/dev/null || true
ls -la lib/ 2>/dev/null || true