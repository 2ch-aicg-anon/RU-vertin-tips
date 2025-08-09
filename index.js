import { eventSource, event_types, saveSettingsDebounced, is_send_press } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const extensionName = 'vertin-tips';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
    enabled: true,
    volume: 0.5,
    mysteryMode: false,  // 神秘模式
    dingdongMode: false  // 叮咚鸡模式
};

// 音频对象
let successSound = null;  // 成功提示音
let errorSound = null;    // 错误提示音

// 跟踪生成状态
let generationState = {
    isGenerating: false,
    wasStoppedOrError: false,
    lastErrorTime: 0
};

// 初始化扩展
jQuery(async () => {
    // 加载设置
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    
    // 初始化音频
    initAudio();
    
    // 注册事件监听器
    registerEventListeners();
    
    // 添加设置界面
    addSettingsUI();
    
    console.log(`[${extensionName}] 扩展已加载`);
});

// 初始化音频
function initAudio() {
    const settings = extension_settings[extensionName];
    
    try {
        // 根据模式选择不同的音频文件
        if (settings.dingdongMode) {
            // 叮咚鸡模式 - 最高优先级
            successSound = new Audio(`/${extensionFolderPath}/audio/叮咚鸡！.mp3`);
            errorSound = settings.mysteryMode ? 
                new Audio(`/${extensionFolderPath}/audio/error.mp3`) : 
                new Audio(`/${extensionFolderPath}/audio/error_normal.mp3`);
        } else if (settings.mysteryMode) {
            // 神秘模式音频
            successSound = new Audio(`/${extensionFolderPath}/audio/okay.mp3`);
            errorSound = new Audio(`/${extensionFolderPath}/audio/error.mp3`);
        } else {
            // 普通模式音频
            successSound = new Audio(`/${extensionFolderPath}/audio/voice.mp3`);
            errorSound = new Audio(`/${extensionFolderPath}/audio/error_normal.mp3`);
        }
        
        // 设置音量
        successSound.volume = settings.volume;
        errorSound.volume = settings.volume;
        
        // 预加载音频
        successSound.load();
        errorSound.load();
    } catch (error) {
        console.error(`[${extensionName}] 无法加载音频文件:`, error);
    }
}

// 注册事件监听器
function registerEventListeners() {
    // 监听生成开始事件
    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    
    // 监听生成停止事件（错误或手动停止）
    eventSource.on(event_types.GENERATION_STOPPED, onGenerationStopped);
    
    // 监听生成结束事件（正常完成）
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
    
    // 监听toastr错误消息来检测API错误
    interceptToastrErrors();
    
    // 拦截fetch响应来检测HTTP错误
    interceptFetchErrors();
}

// 生成开始时
function onGenerationStarted() {
    generationState.isGenerating = true;
    generationState.wasStoppedOrError = false;
    console.log(`[${extensionName}] AI开始生成回复`);
}

// 拦截fetch响应来检测HTTP错误
function interceptFetchErrors() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            const url = args[0]?.toString() || '';
            
            // 检查是否是API请求且返回错误状态
            if (url.includes('/api/') && !response.ok && response.status >= 400) {
                const errorInfo = `HTTP ${response.status} ${response.statusText}`;
                console.log(`[${extensionName}] 检测到HTTP错误: ${errorInfo} - ${url}`);
                
                // 如果正在生成AI回复，记录错误
                if (generationState.isGenerating) {
                    generationState.wasStoppedOrError = true;
                    generationState.lastErrorTime = Date.now();
                    
                    // 延迟播放错误音，让toastr先显示
                    if (extension_settings[extensionName].enabled) {
                        setTimeout(() => {
                            playErrorSound();
                        }, 200);
                    }
                }
            }
            
            return response;
        } catch (error) {
            // 网络错误（无法连接、超时等）
            const url = args[0]?.toString() || '';
            if (url.includes('/api/') && generationState.isGenerating) {
                console.log(`[${extensionName}] 检测到网络错误: ${error.message}`);
                generationState.wasStoppedOrError = true;
                generationState.lastErrorTime = Date.now();
                
                if (extension_settings[extensionName].enabled) {
                    setTimeout(() => {
                        playErrorSound();
                    }, 200);
                }
            }
            throw error;
        }
    };
}

// 拦截toastr错误消息
function interceptToastrErrors() {
    // 保存原始的toastr.error函数
    const originalToastrError = window.toastr.error;
    
    // 定义HTTP错误码列表
    const httpErrorPatterns = [
        // 4xx 客户端错误
        /\b400\b/, /\b401\b/, /\b402\b/, /\b403\b/, /\b404\b/, 
        /\b405\b/, /\b406\b/, /\b407\b/, /\b408\b/, /\b409\b/,
        /\b410\b/, /\b411\b/, /\b412\b/, /\b413\b/, /\b414\b/,
        /\b415\b/, /\b416\b/, /\b417\b/, /\b418\b/, /\b421\b/,
        /\b422\b/, /\b423\b/, /\b424\b/, /\b425\b/, /\b426\b/,
        /\b428\b/, /\b429\b/, /\b431\b/, /\b451\b/,
        // 5xx 服务器错误
        /\b500\b/, /\b501\b/, /\b502\b/, /\b503\b/, /\b504\b/,
        /\b505\b/, /\b506\b/, /\b507\b/, /\b508\b/, /\b510\b/, /\b511\b/,
        // 常见错误关键词
        /unauthorized/i, /forbidden/i, /not found/i, /bad request/i,
        /internal server error/i, /service unavailable/i, /gateway timeout/i,
        /too many requests/i, /rate limit/i, /quota exceeded/i,
        /network error/i, /connection refused/i, /timeout/i,
        /failed to fetch/i, /fetch error/i, /request failed/i,
        /ECONNREFUSED/, /ETIMEDOUT/, /ENOTFOUND/, /ECONNRESET/
    ];
    
    // 重写toastr.error函数
    window.toastr.error = function(message, title, options) {
        const fullText = `${title || ''} ${message || ''}`;
        let isApiError = false;
        let errorType = 'unknown';
        
        // 检查是否包含API关键词
        if (title && (title.includes('API') || title.includes('Error') || title.includes('Failed'))) {
            isApiError = true;
            errorType = 'api_keyword';
        }
        
        // 检查是否包含HTTP错误码或错误关键词
        for (const pattern of httpErrorPatterns) {
            if (pattern.test(fullText)) {
                isApiError = true;
                errorType = pattern.source;
                break;
            }
        }
        
        // 检测到错误时的处理
        if (isApiError) {
            console.log(`[${extensionName}] 检测到错误 [${errorType}]: ${fullText}`);
            generationState.wasStoppedOrError = true;
            generationState.lastErrorTime = Date.now();
            
            // 如果正在生成，播放错误音
            if (generationState.isGenerating && extension_settings[extensionName].enabled) {
                setTimeout(() => {
                    playErrorSound();
                }, 100); // 小延迟确保其他处理完成
            }
        }
        
        // 调用原始函数
        return originalToastrError.call(this, message, title, options);
    };
}

// 生成停止时（错误或手动停止）
function onGenerationStopped() {
    const settings = extension_settings[extensionName];
    
    generationState.wasStoppedOrError = true;
    generationState.isGenerating = false;
    console.log(`[${extensionName}] AI生成被手动停止`);
    
    // 只在手动停止时播放错误音（API错误由toastr拦截处理）
    // 检查是否刚刚有API错误（1秒内）
    const timeSinceError = Date.now() - generationState.lastErrorTime;
    if (settings.enabled && timeSinceError > 1000) {
        playErrorSound();
    }
}

// 生成正常结束时
function onGenerationEnded() {
    const settings = extension_settings[extensionName];
    
    // 检查是否有错误发生（包括API错误）
    const hasError = generationState.wasStoppedOrError || 
                    (Date.now() - generationState.lastErrorTime < 2000);
    
    // 只有在启用且没有错误的情况下才播放成功音
    if (settings.enabled && !hasError && generationState.isGenerating) {
        console.log(`[${extensionName}] AI回复成功，播放成功音`);
        playSuccessSound();
    } else if (settings.enabled && hasError) {
        console.log(`[${extensionName}] 生成结束但有错误，不播放成功音`);
    }
    
    // 重置状态
    generationState.isGenerating = false;
    generationState.wasStoppedOrError = false;
}

// 播放成功提示音
function playSuccessSound() {
    if (!successSound) {
        console.warn(`[${extensionName}] 成功音频未初始化`);
        return;
    }
    
    try {
        // 重置音频以支持快速连续播放
        successSound.currentTime = 0;
        successSound.volume = extension_settings[extensionName].volume;
        
        // 播放音频
        successSound.play().catch(error => {
            console.error(`[${extensionName}] 播放成功提示音失败:`, error);
        });
    } catch (error) {
        console.error(`[${extensionName}] 播放成功提示音失败:`, error);
    }
}

// 播放错误提示音
function playErrorSound() {
    if (!errorSound) {
        console.warn(`[${extensionName}] 错误音频未初始化`);
        return;
    }
    
    try {
        // 重置音频以支持快速连续播放
        errorSound.currentTime = 0;
        errorSound.volume = extension_settings[extensionName].volume;
        
        // 播放音频
        errorSound.play().catch(error => {
            console.error(`[${extensionName}] 播放错误提示音失败:`, error);
        });
    } catch (error) {
        console.error(`[${extensionName}] 播放错误提示音失败:`, error);
    }
}

// 添加设置界面
function addSettingsUI() {
    const settingsHtml = `
    <div id="vertin-tips-settings">
        <div class="inline-drawer">
            <div id="vertin-tips-header" class="inline-drawer-toggle inline-drawer-header">
                <b>Vertin的小提示</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div id="vertin-tips-content" class="inline-drawer-content" style="display: none;">
                <div style="padding: 10px;">
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input id="vertin-tips-enabled" type="checkbox" />
                            <span>启用提示音</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input id="vertin-tips-mystery" type="checkbox" />
                            <span>神秘模式</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input id="vertin-tips-dingdong" type="checkbox" />
                            <span>我想叮咚鸡！🐔</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label>
                            <div>音量: <span id="vertin-tips-volume-value">50</span>%</div>
                            <input id="vertin-tips-volume" type="range" min="0" max="100" value="50" style="width: 100%;" />
                        </label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <button id="vertin-tips-test-success" class="menu_button" style="width: 100%;">
                            <i class="fa-solid fa-check"></i> 测试成功音
                        </button>
                    </div>
                    <div>
                        <button id="vertin-tips-test-error" class="menu_button" style="width: 100%;">
                            <i class="fa-solid fa-times"></i> 测试错误音
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    // 添加到扩展设置面板
    $('#extensions_settings').append(settingsHtml);
    
    // 绑定设置控件
    bindSettingsControls();
}

// 绑定设置控件
function bindSettingsControls() {
    const settings = extension_settings[extensionName];
    
    // 启用/禁用开关
    $('#vertin-tips-enabled')
        .prop('checked', settings.enabled)
        .on('change', function() {
            settings.enabled = $(this).prop('checked');
            saveSettingsDebounced();
        });
    
    // 神秘模式开关
    $('#vertin-tips-mystery')
        .prop('checked', settings.mysteryMode)
        .on('change', function() {
            settings.mysteryMode = $(this).prop('checked');
            saveSettingsDebounced();
            // 重新初始化音频以加载不同的文件
            initAudio();
        });
    
    // 叮咚鸡模式开关
    $('#vertin-tips-dingdong')
        .prop('checked', settings.dingdongMode)
        .on('change', function() {
            settings.dingdongMode = $(this).prop('checked');
            saveSettingsDebounced();
            // 重新初始化音频以加载不同的文件
            initAudio();
        });
    
    // 音量滑块
    $('#vertin-tips-volume')
        .val(settings.volume * 100)
        .on('input', function() {
            const volume = $(this).val() / 100;
            settings.volume = volume;
            $('#vertin-tips-volume-value').text($(this).val());
            
            // 更新音频对象的音量
            if (successSound) {
                successSound.volume = volume;
            }
            if (errorSound) {
                errorSound.volume = volume;
            }
            
            saveSettingsDebounced();
        });
    
    // 更新音量显示
    $('#vertin-tips-volume-value').text(Math.round(settings.volume * 100));
    
    // 测试成功音按钮
    $('#vertin-tips-test-success').on('click', function() {
        playSuccessSound();
    });
    
    // 测试错误音按钮
    $('#vertin-tips-test-error').on('click', function() {
        playErrorSound();
    });
    
    // 折叠面板功能 - 使用ID选择器避免冲突
    $('#vertin-tips-header').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const content = $('#vertin-tips-content');
        const icon = $(this).find('.inline-drawer-icon');
        
        if (content.is(':visible')) {
            content.slideUp(200);
            icon.removeClass('up').addClass('down');
        } else {
            content.slideDown(200);
            icon.removeClass('down').addClass('up');
        }
    });
}