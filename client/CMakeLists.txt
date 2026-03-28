cmake_minimum_required(VERSION 3.16)
project(openclaw_client VERSION 1.0.0 LANGUAGES CXX)

# C++17 标准
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# 输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# 头文件
include_directories(include)

# 源文件
set(SOURCES
    src/openclaw_client.cpp
)

# ========================================
# Android 交叉编译支持
# ========================================

# 设置 Android NDK 路径
set(ANDROID_NDK_ROOT "$ENV{HOME}/android-ndk-r27d/android-ndk-r27d" CACHE PATH "Android NDK root")

# Android 编译选项
set(ANDROID_PLATFORM android-24)  # Android 7.0+
set(ANDROID_ABI "arm64-v8a")     # ARM64 (aarch64)

# 如果 NDK 路径存在，使用 Android 工具链
if(EXISTS ${ANDROID_NDK_ROOT})
    message(STATUS "Using Android NDK: ${ANDROID_NDK_ROOT}")
    
    # 设置 CMake 工具链文件
    set(CMAKE_TOOLCHAIN_FILE "${ANDROID_NDK_ROOT}/build/cmake/android.toolchain.cmake")
    
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -DANDROID -fPIC -ffunction-sections -fdata-sections")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -Oz -fvisibility=hidden -fvisibility-inlines-hidden")
    
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -Wl,--gc-sections")
    
    message(STATUS "Android NDK configured for ABI: ${ANDROID_ABI}")
else()
    message(WARNING "Android NDK not found at: ${ANDROID_NDK_ROOT}")
    message(STATUS "Building for host (Linux) instead")
endif()

# 静态库
add_library(openclaw_client STATIC ${SOURCES})
set_target_properties(openclaw_client PROPERTIES
    POSITION_INDEPENDENT_CODE ON
)

# 安装
install(TARGETS openclaw_client
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(DIRECTORY include/
    DESTINATION include
)

# 可选: 构建示例
option(BUILD_EXAMPLES "Build example programs" ON)

if(BUILD_EXAMPLES)
    add_executable(demo ../examples/demo.cpp)
    target_link_libraries(demo openclaw_client)
    target_compile_options(demo PRIVATE -Wall -Wextra)
endif()

# 测试 (如果需要)
enable_testing()