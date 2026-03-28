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
# add_subdirectory(test)  # TODO: 添加测试