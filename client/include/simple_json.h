#ifndef SIMPLE_JSON_H
#define SIMPLE_JSON_H

#include <string>
#include <map>
#include <vector>
#include <stdexcept>
#include <cctype>
#include <sstream>

namespace simple_json {

class Json {
public:
    enum Type {
        NONE,
        OBJECT,
        ARRAY,
        STRING,
        NUMBER,
        BOOL,
        NULL_TYPE
    };
    
private:
    Type type_;
    std::string strValue_;
    double numValue_;
    bool boolValue_;
    std::map<std::string, Json> objValue_;
    std::vector<Json> arrValue_;
    
public:
    Json() : type_(NONE) {}
    Json(Type t) : type_(t) {}
    Json(const Json& other) { copyFrom(other); }
    Json& operator=(const Json& other) { copyFrom(other); return *this; }
    
    void copyFrom(const Json& other) {
        type_ = other.type_;
        strValue_ = other.strValue_;
        numValue_ = other.numValue_;
        boolValue_ = other.boolValue_;
        objValue_ = other.objValue_;
        arrValue_ = other.arrValue_;
    }
    
    // 工厂方法
    static Json object() { return Json(OBJECT); }
    static Json array() { return Json(ARRAY); }
    static Json string(const std::string& s) { Json j(STRING); j.strValue_ = s; return j; }
    static Json number(double n) { Json j(NUMBER); j.numValue_ = n; return j; }
    static Json boolean(bool b) { Json j(BOOL); j.boolValue_ = b; return j; }
    static Json null() { return Json(NULL_TYPE); }
    
    Type type() const { return type_; }
    
    bool isObject() const { return type_ == OBJECT; }
    bool isArray() const { return type_ == ARRAY; }
    bool isString() const { return type_ == STRING; }
    bool isNumber() const { return type_ == NUMBER; }
    bool isBool() const { return type_ == BOOL; }
    bool isNull() const { return type_ == NULL_TYPE; }
    
    // 获取值
    std::string stringValue() const { return strValue_; }
    double numberValue() const { return numValue_; }
    bool boolValue() const { return boolValue_; }
    
    // 对象访问
    Json& operator[](const std::string& key) {
        if (type_ != OBJECT) {
            type_ = OBJECT;
            objValue_.clear();
        }
        return objValue_[key];
    }
    
    const Json& operator[](const std::string& key) const {
        static Json empty;
        auto it = objValue_.find(key);
        return (it != objValue_.end()) ? it->second : empty;
    }
    
    bool has(const std::string& key) const {
        return objValue_.find(key) != objValue_.end();
    }
    
    // 数组访问
    Json& operator[](size_t idx) {
        if (type_ != ARRAY) {
            type_ = ARRAY;
            arrValue_.clear();
        }
        if (idx >= arrValue_.size()) {
            arrValue_.resize(idx + 1);
        }
        return arrValue_[idx];
    }
    
    const Json& operator[](size_t idx) const {
        static Json empty;
        return (idx < arrValue_.size()) ? arrValue_[idx] : empty;
    }
    
    size_t size() const { return arrValue_.size(); }
    
    // 获取值，带默认值
    std::string value(const std::string& key, const std::string& defaultValue) const {
        auto it = objValue_.find(key);
        if (it != objValue_.end() && it->second.isString()) {
            return it->second.strValue_;
        }
        return defaultValue;
    }
    
    int value(const std::string& key, int defaultValue) const {
        auto it = objValue_.find(key);
        if (it != objValue_.end() && it->second.isNumber()) {
            return static_cast<int>(it->second.numValue_);
        }
        return defaultValue;
    }
    
    // 序列化
    std::string dump() const {
        std::ostringstream oss;
        dumpTo(oss);
        return oss.str();
    }
    
    // 解析
    static Json parse(const std::string& str);
    
private:
    void dumpTo(std::ostream& os) const {
        switch (type_) {
            case NONE:
            case NULL_TYPE:
                os << "null";
                break;
            case BOOL:
                os << (boolValue_ ? "true" : "false");
                break;
            case NUMBER:
                os << numValue_;
                break;
            case STRING:
                os << "\"" << escapeString(strValue_) << "\"";
                break;
            case OBJECT:
                os << "{";
                for (auto it = objValue_.begin(); it != objValue_.end(); ++it) {
                    if (it != objValue_.begin()) os << ",";
                    os << "\"" << escapeString(it->first) << "\":";
                    it->second.dumpTo(os);
                }
                os << "}";
                break;
            case ARRAY:
                os << "[";
                for (size_t i = 0; i < arrValue_.size(); ++i) {
                    if (i > 0) os << ",";
                    arrValue_[i].dumpTo(os);
                }
                os << "]";
                break;
        }
    }
    
    static std::string escapeString(const std::string& s) {
        std::string r;
        for (char c : s) {
            if (c == '"') r += "\\\"";
            else if (c == '\\') r += "\\\\";
            else if (c == '\n') r += "\\n";
            else if (c == '\r') r += "\\r";
            else if (c == '\t') r += "\\t";
            else r += c;
        }
        return r;
    }
    
    static void skipWhitespace(const std::string& s, size_t& i) {
        while (i < s.size() && std::isspace(s[i])) i++;
    }
    
    static Json parseValue(const std::string& s, size_t& i);
    static Json parseObject(const std::string& s, size_t& i);
    static Json parseArray(const std::string& s, size_t& i);
    static Json parseString(const std::string& s, size_t& i);
    static Json parseNumber(const std::string& s, size_t& i);
    static Json parseBool(const std::string& s, size_t& i);
    static Json parseNull(const std::string& s, size_t& i);
};

inline Json Json::parse(const std::string& str) {
    size_t i = 0;
    skipWhitespace(str, i);
    return parseValue(str, i);
}

inline Json Json::parseValue(const std::string& s, size_t& i) {
    skipWhitespace(s, i);
    if (i >= s.size()) return Json::null();
    
    char c = s[i];
    
    if (c == '{') return parseObject(s, i);
    if (c == '[') return parseArray(s, i);
    if (c == '"') return parseString(s, i);
    if (c == 't' || c == 'f') return parseBool(s, i);
    if (c == 'n') return parseNull(s, i);
    if (c == '-' || std::isdigit(c)) return parseNumber(s, i);
    
    return Json::null();
}

inline Json Json::parseObject(const std::string& s, size_t& i) {
    Json obj = Json::object();
    i++; // skip {
    
    skipWhitespace(s, i);
    if (i >= s.size() || s[i] == '}') {
        i++;
        return obj;
    }
    
    while (true) {
        skipWhitespace(s, i);
        if (s[i] != '"') break;
        
        Json key = parseString(s, i);
        
        skipWhitespace(s, i);
        if (s[i] != ':') break;
        i++;
        
        Json value = parseValue(s, i);
        obj[key.stringValue()] = value;
        
        skipWhitespace(s, i);
        if (s[i] == '}') {
            i++;
            break;
        }
        if (s[i] == ',') i++;
    }
    
    return obj;
}

inline Json Json::parseArray(const std::string& s, size_t& i) {
    Json arr = Json::array();
    i++; // skip [
    
    skipWhitespace(s, i);
    if (i >= s.size() || s[i] == ']') {
        i++;
        return arr;
    }
    
    while (true) {
        Json value = parseValue(s, i);
        arr[arr.size()] = value;
        
        skipWhitespace(s, i);
        if (s[i] == ']') {
            i++;
            break;
        }
        if (s[i] == ',') i++;
    }
    
    return arr;
}

inline Json Json::parseString(const std::string& s, size_t& i) {
    i++; // skip opening "
    std::string result;
    
    while (i < s.size() && s[i] != '"') {
        if (s[i] == '\\' && i + 1 < s.size()) {
            i++;
            switch (s[i]) {
                case 'n': result += '\n'; break;
                case 'r': result += '\r'; break;
                case 't': result += '\t'; break;
                case '"': result += '"'; break;
                case '\\': result += '\\'; break;
                default: result += s[i]; break;
            }
        } else {
            result += s[i];
        }
        i++;
    }
    
    if (i < s.size()) i++; // skip closing "
    return Json::string(result);
}

inline Json Json::parseNumber(const std::string& s, size_t& i) {
    size_t start = i;
    if (s[i] == '-') i++;
    while (i < s.size() && (std::isdigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) {
        i++;
    }
    std::string numStr = s.substr(start, i - start);
    return Json::number(std::stod(numStr));
}

inline Json Json::parseBool(const std::string& s, size_t& i) {
    if (s.substr(i, 4) == "true") {
        i += 4;
        return Json::boolean(true);
    }
    if (s.substr(i, 5) == "false") {
        i += 5;
        return Json::boolean(false);
    }
    return Json::boolean(false);
}

inline Json Json::parseNull(const std::string& s, size_t& i) {
    if (s.substr(i, 4) == "null") {
        i += 4;
    }
    return Json::null();
}

} // namespace simple_json

#endif // SIMPLE_JSON_H